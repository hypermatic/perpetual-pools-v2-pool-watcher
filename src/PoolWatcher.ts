import { TypedEmitter } from 'tiny-typed-emitter';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { calcNextValueTransfer } from '@tracer-protocol/pools-js';

// TODO: update to latest version after redeploy/abis are provided via sdk or other package
import {
  ERC20__factory,
  LeveragedPool,
  LeveragedPool__factory,
  PoolCommitter__factory,
  PoolKeeper__factory,
  PoolSwapLibrary,
  PoolSwapLibrary__factory
} from './typesV2';

import {
  poolSwapLibraryAddresses,
  attemptPromiseRecursively,
  ethersBNtoBN,
  movingAveragePriceTransformer
} from './utils';

import {
  PoolWatcherConstructorArgs,
  WatchedPool,
  ExpectedPoolState,
  TotalPoolCommitments,
  TotalPoolCommitmentsBN,
  CommitEventData,
  UpkeepEventData,
  RawCommitType,
  ExpectedPoolStateInputs
} from './types';

export const EVENT_NAMES = {
  COMMITMENT_WINDOW_ENDING: 'COMMITMENT_WINDOW_ENDING',
  COMMITMENT_WINDOW_ENDED: 'COMMITMENT_WINDOW_ENDED',
  UPKEEP: 'UPKEEP',
  COMMIT: 'COMMIT'
} as const;

interface PoolWatcherEvents {
  [EVENT_NAMES.COMMIT]: (data: CommitEventData) => void;
  [EVENT_NAMES.UPKEEP]: (data: UpkeepEventData) => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDED]: () => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDING]: (state: ExpectedPoolState) => void;
}

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
      quoteTokenAddress,
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
      attemptPromiseRecursively({ promise: () => this.poolInstance.quoteToken() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.tokens(0) }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.tokens(1) }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.lastPriceTimestamp() })
    ]);

    const leverage = await attemptPromiseRecursively({
      promise: () => this.poolSwapLibrary.convertDecimalToUInt(_leverageAmount)
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
      quoteTokenInstance: ERC20__factory.connect(quoteTokenAddress, this.provider),
      isUpdatingLastPriceTimestamp: false,
      hasCalculatedStateThisUpdate: false
    };
  }

  /**
   *
   * @returns
   */
  async getRelevantPendingCommits (): Promise<TotalPoolCommitmentsBN[]> {
    if (!this.watchedPool.address) {
      throw new Error('getRelevantPendingCommits: watched pool not initialised');
    }

    const { frontRunningInterval, updateInterval, committerInstance } = this.watchedPool;

    if (frontRunningInterval < updateInterval) {
      // simple case, commits will be executed either in next upkeep or one after if committed within the front running interval
      return attemptPromiseRecursively({
        promise: async () => {
          const [pendingCommitsThisInterval] = await committerInstance.getPendingCommits();

          return [this.pendingCommitsToBN(pendingCommitsThisInterval)];
        }
      });
    }

    const upkeepsPerFrontRunningInterval = Math.floor(frontRunningInterval / updateInterval);
    const pendingCommitPromises: Promise<TotalPoolCommitmentsBN>[] = [];

    // next update interval to be upkept
    const updateIntervalId = (await attemptPromiseRecursively({
      promise: () => this.watchedPool.committerInstance.updateIntervalId()
    })).toNumber();

    // the last update interval that will be executed in the frontrunning interval as of now
    const maxIntervalId = updateIntervalId + upkeepsPerFrontRunningInterval;

    for (let i = updateIntervalId; i <= maxIntervalId; i++) {
      pendingCommitPromises.push(attemptPromiseRecursively({
        promise: async () => {
          const pendingCommitsThisInterval = await committerInstance.totalPoolCommitments(i);
          return this.pendingCommitsToBN(pendingCommitsThisInterval);
        }
      }));
    }

    return Promise.all(pendingCommitPromises);
  }

  pendingCommitsToBN (pendingCommits: TotalPoolCommitments): TotalPoolCommitmentsBN {
    return {
      longBurnAmount: ethersBNtoBN(pendingCommits.longBurnAmount),
      longMintAmount: ethersBNtoBN(pendingCommits.longMintAmount),
      longBurnShortMintAmount: ethersBNtoBN(pendingCommits.longBurnShortMintAmount),
      shortBurnAmount: ethersBNtoBN(pendingCommits.shortBurnAmount),
      shortMintAmount: ethersBNtoBN(pendingCommits.shortMintAmount),
      shortBurnLongMintAmount: ethersBNtoBN(pendingCommits.shortBurnLongMintAmount),
      updateIntervalId: ethersBNtoBN(pendingCommits.updateIntervalId)
    };
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

  async getExpectedStateInputs (): Promise<ExpectedPoolStateInputs> {
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
      shortTokenSupply
    ] = await Promise.all([
      attemptPromiseRecursively({ promise: () => this.poolInstance.longBalance() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.shortBalance() }),
      attemptPromiseRecursively({ promise: () => this.poolInstance.getOraclePrice() }),
      attemptPromiseRecursively({ promise: () => keeperInstance.executionPrice(this.poolAddress) }),
      attemptPromiseRecursively({ promise: () => this.getRelevantPendingCommits() }),
      attemptPromiseRecursively({ promise: () => longTokenInstance.totalSupply() }),
      attemptPromiseRecursively({ promise: () => shortTokenInstance.totalSupply() })
    ]);

    return {
      leverage,
      longBalance: ethersBNtoBN(longBalance),
      shortBalance: ethersBNtoBN(shortBalance),
      lastOraclePrice: ethersBNtoBN(lastOraclePrice),
      currentOraclePrice: ethersBNtoBN(currentOraclePrice),
      pendingCommits,
      longTokenSupply: ethersBNtoBN(longTokenSupply),
      shortTokenSupply: ethersBNtoBN(shortTokenSupply)
    };
  }

  calculatePoolState (inputs: ExpectedPoolStateInputs): ExpectedPoolState {
    if (!this.watchedPool.address) {
      throw new Error('calculatePoolState: watched pool not initialised');
    }

    const {
      leverage,
      longBalance,
      shortBalance,
      longTokenSupply,
      shortTokenSupply,
      lastOraclePrice,
      currentOraclePrice,
      pendingCommits
    } = inputs;

    let expectedLongBalance = new BigNumber(longBalance.toString());
    let expectedShortBalance = new BigNumber(shortBalance.toString());
    let expectedLongSupply = new BigNumber(longTokenSupply.toString());
    let expectedShortSupply = new BigNumber(shortTokenSupply.toString());
    let totalNetPendingLong = new BigNumber(0);
    let totalNetPendingShort = new BigNumber(0);
    let expectedLongTokenPrice = expectedLongBalance.div(expectedLongSupply);
    let expectedShortTokenPrice = expectedShortBalance.div(expectedShortSupply);

    let movingOraclePriceBefore = lastOraclePrice;
    let movingOraclePriceAfter = lastOraclePrice;

    for (const pendingCommit of pendingCommits) {
      const {
        longBurnAmount,
        longBurnShortMintAmount,
        longMintAmount,
        shortBurnAmount,
        shortBurnLongMintAmount,
        shortMintAmount
      } = pendingCommit;

      // apply price transformations to emulate underlying oracle wrapper implementation
      movingOraclePriceBefore = movingOraclePriceAfter;
      movingOraclePriceAfter = this.oraclePriceTransformer(movingOraclePriceBefore, currentOraclePrice);

      const { longValueTransfer, shortValueTransfer } = calcNextValueTransfer(
        movingOraclePriceBefore,
        movingOraclePriceAfter,
        new BigNumber(leverage),
        expectedLongBalance,
        expectedShortBalance
      );

      // balances immediately before commits executed
      expectedLongBalance = expectedLongBalance.plus(longValueTransfer);
      expectedShortBalance = expectedShortBalance.plus(shortValueTransfer);

      const totalLongBurn = longBurnAmount.plus(longBurnShortMintAmount);
      const totalShortBurn = shortBurnAmount.plus(shortBurnLongMintAmount);

      // current balance + expected value transfer / expected supply
      // if either side has no token supply, any amount no matter how small will buy the whole side
      const longTokenPriceDenominator = expectedLongSupply.plus(totalLongBurn);

      expectedLongTokenPrice = longTokenPriceDenominator.lte(0)
        ? expectedLongBalance
        : expectedLongBalance.div(longTokenPriceDenominator);

      const shortTokenPriceDenominator = expectedShortSupply.plus(totalShortBurn);

      expectedShortTokenPrice = shortTokenPriceDenominator.lte(0)
        ? expectedShortBalance
        : expectedShortBalance.div(shortTokenPriceDenominator);

      const totalLongMint = longMintAmount.plus(shortBurnLongMintAmount.times(expectedShortTokenPrice));
      const totalShortMint = shortMintAmount.plus(longBurnShortMintAmount.times(expectedLongTokenPrice));

      const netPendingLongBalance = totalLongMint.minus(totalLongBurn.times(expectedLongTokenPrice));
      const netPendingShortBalance = totalShortMint.minus(totalShortBurn.times(expectedShortTokenPrice));

      totalNetPendingLong = totalNetPendingLong.plus(netPendingLongBalance);
      totalNetPendingShort = totalNetPendingShort.plus(netPendingShortBalance);

      expectedLongBalance = expectedLongBalance.plus(netPendingLongBalance);
      expectedShortBalance = expectedShortBalance.plus(netPendingShortBalance);

      expectedLongSupply = expectedLongSupply.minus(totalLongBurn).plus(totalLongMint.div(expectedLongTokenPrice));
      expectedShortSupply = expectedShortSupply.minus(totalShortBurn).plus(totalShortMint.div(expectedShortTokenPrice));
    }

    const expectedSkew = expectedShortBalance.eq(0) || expectedLongBalance.eq(0)
      ? new BigNumber(1)
      : expectedLongBalance.div(expectedShortBalance);

    return {
      timestamp: Math.floor(Date.now() / 1000),
      currentSkew: longBalance.eq(0) || shortBalance.eq(0) ? new BigNumber(1) : longBalance.div(shortBalance),
      currentLongBalance: longBalance,
      currentLongSupply: longTokenSupply,
      currentShortBalance: shortBalance,
      currentShortSupply: shortTokenSupply,
      expectedSkew,
      expectedLongBalance,
      expectedLongSupply,
      expectedShortBalance,
      expectedShortSupply,
      totalNetPendingLong,
      totalNetPendingShort,
      expectedLongTokenPrice,
      expectedShortTokenPrice,
      lastOraclePrice: lastOraclePrice,
      expectedOraclePrice: movingOraclePriceAfter,
      pendingCommits
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
        this.watchedPool.keeperInstance.once(upkeepSuccessfulFilter, () => {
          scheduleStateCalculation();
        });
      } else {
        // set time out for waitUntil - nowSeconds
        // wake up and check if we are still inside of the same commitment window
        setTimeout(async () => {
          const updateIntervalBeforeStateCalc = await this.isCommitmentWindowStillOpen(
            appropriateIntervalIdBefore.toNumber()
          );

          // if the appropriate update interval id is still the same as before we slept,
          // we are still within the acceptable commitment window
          if (updateIntervalBeforeStateCalc) {
            const expectedStateInputs = await this.getExpectedStateInputs();

            const expectedState = this.calculatePoolState(expectedStateInputs);

            // do one last check to make sure commitment window has not ended
            const updateIntervalIdAfterStateCalc = await attemptPromiseRecursively({
              promise: () => this.watchedPool.committerInstance.getAppropriateUpdateIntervalId()
            });

            if (appropriateIntervalIdBefore.eq(updateIntervalIdAfterStateCalc)) {
              this.emit(EVENT_NAMES.COMMITMENT_WINDOW_ENDING, expectedState);
            }
          }

          this.watchedPool.keeperInstance.once(upkeepSuccessfulFilter, () => {
            scheduleStateCalculation();
          });
        }, (waitUntil - nowSeconds) * 1000);
      };
    };

    scheduleStateCalculation();

    const createCommitFilter = this.watchedPool.committerInstance.filters.CreateCommit();

    this.watchedPool.committerInstance.on(createCommitFilter, (user, amount, commitType, appropriateIntervalId, mintingFee) => {
      this.emit(EVENT_NAMES.COMMIT, {
        user,
        amount: ethersBNtoBN(amount),
        commitType: commitType as RawCommitType,
        appropriateIntervalId: appropriateIntervalId.toNumber(),
        mintingFee
      });
    });

    this.watchedPool.keeperInstance.on(upkeepSuccessfulFilter, (poolAddress, data, startPrice, endPrice) => {
      this.emit(EVENT_NAMES.UPKEEP, {
        poolAddress,
        data,
        startPrice: ethersBNtoBN(startPrice),
        endPrice: ethersBNtoBN(endPrice)
      });
    });
  }
}
