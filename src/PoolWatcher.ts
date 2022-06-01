import { TypedEmitter } from 'tiny-typed-emitter';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import {
  pendingCommitsToBN,
  calcPoolStatePreview,
  PoolStatePreviewInputs,
  ethersBNtoBN
} from '@tracer-protocol/pools-js';

// TODO: update to latest version after redeploy/abis are provided via sdk or other package
import {
  ERC20__factory,
  LeveragedPool,
  LeveragedPool__factory,
  PoolCommitter__factory,
  PoolKeeper__factory,
  PoolSwapLibrary,
  PoolSwapLibrary__factory
} from '@tracer-protocol/perpetual-pools-contracts/types';

import {
  poolSwapLibraryAddresses,
  attemptPromiseRecursively,
  movingAveragePriceTransformer
} from './utils';

import {
  PoolWatcherConstructorArgs,
  WatchedPool,
  RawCommitType,
  PoolWatcherEvents
} from './types';

import {
  TotalPoolCommitmentsBN
} from '@tracer-protocol/pools-js/types';

import { EVENT_NAMES } from './constants';

export class PoolWatcher extends TypedEmitter<PoolWatcherEvents> {
  provider: ethers.providers.BaseProvider
  watchedPool: WatchedPool
  poolInstance: LeveragedPool
  poolSwapLibrary: PoolSwapLibrary
  poolAddress: string
  chainId: string
  commitmentWindowBuffer: number
  isWatching: boolean
  oraclePriceTransformer: (lastPrice: BigNumber, currentPrice: BigNumber) => BigNumber
  ignoreEvents: { [eventName: string]: boolean }

  constructor (args: PoolWatcherConstructorArgs) {
    super();

    if (!poolSwapLibraryAddresses[args.chainId]) {
      throw new Error(`unsupported chainId: ${args.chainId}, supported values are [${Object.keys(poolSwapLibraryAddresses).join(', ')}]`);
    }

    this.provider = ethers.getDefaultProvider(args.nodeUrl);
    this.poolInstance = LeveragedPool__factory.connect(args.poolAddress, this.provider);
    this.poolSwapLibrary = PoolSwapLibrary__factory.connect(poolSwapLibraryAddresses[args.chainId], this.provider);
    this.poolAddress = args.poolAddress;
    this.chainId = args.chainId;
    this.watchedPool = {} as WatchedPool;
    this.commitmentWindowBuffer = args.commitmentWindowBuffer;
    this.isWatching = false;
    this.oraclePriceTransformer = args.oraclePriceTransformer || movingAveragePriceTransformer;
    this.ignoreEvents = args.ignoreEvents || {};
  }

  // fetches details about pool to watch and
  // initialises smart contract instances of other perpetual pools components (keeper, committer, tokens)
  async initializeWatchedPool () {
    const [
      name,
      committerAddress,
      keeperAddress,
      updateInterval,
      _leverageAmount,
      frontRunningInterval,
      settlementTokenAddress,
      longTokenAddress,
      shortTokenAddress,
      lastPriceTimestamp
    ] = await Promise.all([
      attemptPromiseRecursively({ promise: () => this.poolInstance.poolName() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.poolCommitter() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.keeper() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.updateInterval() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.leverageAmount() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.frontRunningInterval() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.settlementToken() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.tokens(0) }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.tokens(1) }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.lastPriceTimestamp() })
    ]);

    const leverage = await attemptPromiseRecursively({
      promise: () => this.poolSwapLibrary.convertDecimalToUInt(_leverageAmount)
    });
    const settlementTokenInstance = ERC20__factory.connect(settlementTokenAddress, this.provider);
    const settlementTokenDecimals = await attemptPromiseRecursively({
      promise: () => settlementTokenInstance.decimals()
    });

    this.watchedPool = {
      address: this.poolAddress,
      committerInstance: PoolCommitter__factory.connect(committerAddress, this.provider),
      name,
      keeperInstance: PoolKeeper__factory.connect(keeperAddress, this.provider),
      updateInterval,
      frontRunningInterval,
      leverage: leverage.toNumber(),
      lastPriceTimestamp: lastPriceTimestamp.toNumber(),
      longTokenInstance: ERC20__factory.connect(longTokenAddress, this.provider),
      shortTokenInstance: ERC20__factory.connect(shortTokenAddress, this.provider),
      isUpdatingLastPriceTimestamp: false,
      hasCalculatedStateThisUpdate: false,
      settlementTokenInstance,
      settlementTokenDecimals
    };
  }

  /**
   * gets pending commits for all update intervals between now and now + frontRunningInterval
   * @returns
   */
  async getRelevantPendingCommits (): Promise<TotalPoolCommitmentsBN[]> {
    if (!this.watchedPool.address) {
      throw new Error('getRelevantPendingCommits: watched pool not initialised');
    }

    const { frontRunningInterval, updateInterval, committerInstance } = this.watchedPool;

    // next update interval to be upkept
    const updateIntervalId = (await attemptPromiseRecursively({
      promise: () => this.watchedPool.committerInstance.updateIntervalId()
    })).toNumber();

    if (frontRunningInterval < updateInterval) {
      // simple case, commits will be executed either in next upkeep or one after if committed within the front running interval
      return attemptPromiseRecursively({
        promise: async () => {
          const pendingCommitsThisInterval = await committerInstance.totalPoolCommitments(updateIntervalId);

          return [pendingCommitsToBN(pendingCommitsThisInterval)];
        }
      });
    }

    const upkeepsPerFrontRunningInterval = Math.floor(frontRunningInterval / updateInterval);
    const pendingCommitPromises: Promise<TotalPoolCommitmentsBN>[] = [];

    // the last update interval that will be executed in the frontrunning interval as of now
    const maxIntervalId = updateIntervalId + upkeepsPerFrontRunningInterval;

    for (let i = updateIntervalId; i <= maxIntervalId; i++) {
      pendingCommitPromises.push(attemptPromiseRecursively({
        promise: async () => {
          const pendingCommitsThisInterval = await committerInstance.totalPoolCommitments(i);
          return pendingCommitsToBN(pendingCommitsThisInterval);
        }
      }));
    }

    return Promise.all(pendingCommitPromises);
  }

  async isCommitmentWindowStillOpen (updateIntervalId: number) {
    if (!this.watchedPool.address) {
      throw new Error('isCommitmentWindowStillOpen: watched pool not initialised');
    }

    const appropriateUpdateIntervalId = await attemptPromiseRecursively({
      promise: () => this.watchedPool.committerInstance.getAppropriateUpdateIntervalId()
    });

    return appropriateUpdateIntervalId.eq(updateIntervalId);
  }

  async getPoolStatePreviewInputs (): Promise<PoolStatePreviewInputs> {
    if (!this.watchedPool.address) {
      throw new Error('getExpectedStateInput: watched pool not initialised');
    }

    const { leverage, longTokenInstance, shortTokenInstance, keeperInstance } = this.watchedPool;

    const [
      longBalance,
      shortBalance,
      currentOraclePrice,
      lastOraclePrice,
      pendingCommits,
      longTokenSupply,
      shortTokenSupply,
      pendingLongTokenBurn,
      pendingShortTokenBurn,
      fee
    ] = await Promise.all([
      attemptPromiseRecursively({ promise: () => this.poolInstance.longBalance() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.shortBalance() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.getOraclePrice() }),
      attemptPromiseRecursively({ promise: () => keeperInstance.executionPrice(this.poolAddress) }),
      attemptPromiseRecursively({ promise: () => this.getRelevantPendingCommits() }),
      attemptPromiseRecursively({ promise: () => longTokenInstance.totalSupply() }),
      attemptPromiseRecursively({ promise: () => shortTokenInstance.totalSupply() }),
      attemptPromiseRecursively({ promise: () => this.watchedPool.committerInstance.pendingLongBurnPoolTokens() }),
      attemptPromiseRecursively({ promise: () => this.watchedPool.committerInstance.pendingShortBurnPoolTokens() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.getFee() })
    ]);

    return {
      leverage: new BigNumber(leverage),
      longBalance: ethersBNtoBN(longBalance),
      shortBalance: ethersBNtoBN(shortBalance),
      lastOraclePrice: ethersBNtoBN(lastOraclePrice),
      currentOraclePrice: ethersBNtoBN(currentOraclePrice),
      pendingCommits,
      longTokenSupply: ethersBNtoBN(longTokenSupply),
      shortTokenSupply: ethersBNtoBN(shortTokenSupply),
      pendingLongTokenBurn: ethersBNtoBN(pendingLongTokenBurn),
      pendingShortTokenBurn: ethersBNtoBN(pendingShortTokenBurn),
      oraclePriceTransformer: this.oraclePriceTransformer,
      fee: ethersBNtoBN(fee, 18) // fee is always represented in decimal WAD format (1% is 0.01 * 10^18)
    };
  }

  async startWatchingPool () {
    if (this.isWatching) {
      throw new Error('startWatchingPool: already watching');
    }

    this.isWatching = true;

    if (!this.watchedPool.address) {
      throw new Error('startWatchingPool: watched pool not initialised');
    }

    const upkeepSuccessfulFilter = this.watchedPool.keeperInstance.filters.UpkeepSuccessful(this.poolAddress);

    if (!this.ignoreEvents[EVENT_NAMES.COMMITMENT_WINDOW_ENDING] || !this.ignoreEvents[EVENT_NAMES.COMMITMENT_WINDOW_ENDED]) {
      const [emitWindowEnding, emitWindowEnded] = [!this.ignoreEvents[EVENT_NAMES.COMMITMENT_WINDOW_ENDING], !this.ignoreEvents[EVENT_NAMES.COMMITMENT_WINDOW_ENDED]];
      const scheduleStateCalculation = async () => {
        const [
          lastPriceTimestampEthersBN,
          appropriateIntervalIdBefore
        ] = await Promise.all([
          attemptPromiseRecursively({ promise: () => this.poolInstance.lastPriceTimestamp() }),
          attemptPromiseRecursively({ promise: () => this.watchedPool.committerInstance.getAppropriateUpdateIntervalId() })
        ]);

        const { frontRunningInterval, updateInterval } = this.watchedPool as WatchedPool;

        const lastPriceTimestamp = lastPriceTimestampEthersBN.toNumber();
        const commitmentWindowEnd = frontRunningInterval < updateInterval
        // simple case
          ? lastPriceTimestamp + updateInterval - frontRunningInterval
        // complex case, multiple update intervals within frontRunningInterval
          : lastPriceTimestamp + updateInterval;

        // calculate the time at which we should wait until to calculate expected pool state
        const waitUntil = commitmentWindowEnd - this.commitmentWindowBuffer;

        const nowSeconds = Math.floor(Date.now() / 1000);

        // if we are already past the start of the acceptable commitment window end
        // do nothing and wait until next upkeep to schedule anything
        if (nowSeconds > waitUntil) {
          if (emitWindowEnded) {
            if (nowSeconds > commitmentWindowEnd) {
              // if we are already ended
              this.emit(EVENT_NAMES.COMMITMENT_WINDOW_ENDED);
            } else {
              // time is between buffer and commitmentWindowEnd
              setTimeout(() => {
                this.emit(EVENT_NAMES.COMMITMENT_WINDOW_ENDED);
              }, (nowSeconds - commitmentWindowEnd) * 1000);
            }
          }
          this.watchedPool.keeperInstance.once(upkeepSuccessfulFilter, () => {
            scheduleStateCalculation();
          });
        } else {
        // set time out for waitUntil - nowSeconds
        // wake up and check if we are still inside of the same commitment window
          setTimeout(async () => {
            if (emitWindowEnded) {
              // wait the buffer time and fire an ended event
              setTimeout(() => {
                this.emit(EVENT_NAMES.COMMITMENT_WINDOW_ENDED);
              }, this.commitmentWindowBuffer * 1000);
            }

            if (emitWindowEnding) {
              const windowIsOpenBeforeStateCalc = await this.isCommitmentWindowStillOpen(
                appropriateIntervalIdBefore.toNumber()
              );

              // if the appropriate update interval id is still the same as before we slept,
              // we are still within the acceptable commitment window
              if (windowIsOpenBeforeStateCalc) {
                const poolStatePreviewInputs = await this.getPoolStatePreviewInputs();

                const expectedState = calcPoolStatePreview(poolStatePreviewInputs);

                // do one last check to make sure commitment window has not ended
                const windowIsOpenAfterStateCalc = await attemptPromiseRecursively({
                  promise: () => this.watchedPool.committerInstance.getAppropriateUpdateIntervalId()
                });

                if (windowIsOpenAfterStateCalc) {
                  this.emit(EVENT_NAMES.COMMITMENT_WINDOW_ENDING, {
                    ...expectedState,
                    updateIntervalId: ethersBNtoBN(appropriateIntervalIdBefore)
                  });
                }
              }
            }

            this.watchedPool.keeperInstance.once(upkeepSuccessfulFilter, () => {
              scheduleStateCalculation();
            });
          }, (waitUntil - nowSeconds) * 1000);
        };
      };

      scheduleStateCalculation();
    }

    if (!this.ignoreEvents[EVENT_NAMES.COMMIT]) {
      const createCommitFilter = this.watchedPool.committerInstance.filters.CreateCommit();

      this.watchedPool.committerInstance.on(createCommitFilter, async (
        user,
        amount,
        commitType,
        appropriateIntervalId,
        fromAggregateBalance,
        payForClaim,
        mintingFee,
        event
      ) => {
        const block = await event.getBlock();

        this.emit(EVENT_NAMES.COMMIT, {
          user,
          amount: ethersBNtoBN(amount),
          commitType: commitType as RawCommitType,
          appropriateIntervalId: appropriateIntervalId.toNumber(),
          fromAggregateBalance,
          payForClaim,
          mintingFee,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: block.timestamp,
          settlementTokenDecimals: this.watchedPool.settlementTokenDecimals
        });
      });
    }

    if (!this.ignoreEvents[EVENT_NAMES.UPKEEP]) {
      this.watchedPool.keeperInstance.on(upkeepSuccessfulFilter, async (
        poolAddress,
        data,
        startPrice,
        endPrice,
        event
      ) => {
        const block = await event.getBlock();

        this.emit(EVENT_NAMES.UPKEEP, {
          poolAddress,
          data,
          startPrice: ethersBNtoBN(startPrice),
          endPrice: ethersBNtoBN(endPrice),
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: block.timestamp
        });
      });
    }

    if (!this.ignoreEvents[EVENT_NAMES.COMMITS_EXECUTED]) {
      const commitsExecutedFilter = this.watchedPool.committerInstance.filters.ExecutedCommitsForInterval();

      this.watchedPool.committerInstance.on(commitsExecutedFilter, async (
        updateIntervalId,
        burningFee,
        event
      ) => {
        const block = await event.getBlock();

        this.emit(EVENT_NAMES.COMMITS_EXECUTED, {
          updateIntervalId: updateIntervalId.toNumber(),
          burningFee,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: block.timestamp
        });
      });
    }
  }
}
