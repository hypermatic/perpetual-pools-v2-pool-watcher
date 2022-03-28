import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

// TODO: update to latest version after redeploy/abis are provided via sdk or other package
import {
  ERC20,
  PoolCommitter,
  PoolKeeper
} from '@tracer-protocol/perpetual-pools-contracts/types';

import { EVENT_NAMES } from './constants';

export type RawCommitType = 0 | 1 | 2 | 3 | 4 | 5

export type CommitEventData = {
  user: string,
  amount: BigNumber,
  commitType: RawCommitType,
  appropriateIntervalId: number,
  payForClaim: boolean,
  fromAggregateBalance: boolean,
  mintingFee: string,
  timestamp: number,
  blockNumber: number,
  txHash: string
}

export type UpkeepEventData = {
  poolAddress: string,
  data: string,
  startPrice: BigNumber,
  endPrice: BigNumber,
  timestamp: number,
  blockNumber: number,
  txHash: string
}

export type CommitsExecutedData = {
  updateIntervalId: number,
  burningFee: string,
  timestamp: number,
  blockNumber: number,
  txHash: string
}

export type SpecificPool = {
  poolAddress: string;
}

type PoolWatcherArgs = {
  nodeUrl: string
  chainId: string
  commitmentWindowBuffer: number
  oraclePriceTransformer?: (lastPrice: BigNumber, currentPrice: BigNumber) => BigNumber
  ignoreEvents?: {
    [eventName: string]: boolean
  }
}

export type PoolWatcherConstructorArgs = SpecificPool & PoolWatcherArgs;

export type MultiplePoolWatcherConstructorArgs = {
  poolAddresses: string[]
} & PoolWatcherArgs;

export type WatchedPool = {
  address: string,
  name: string,
  keeperInstance: PoolKeeper,
  updateInterval: number,
  lastPriceTimestamp: number,
  leverage: number,
  longTokenInstance: ERC20,
  shortTokenInstance: ERC20,
  settlementTokenInstance: ERC20,
  committerInstance: PoolCommitter,
  frontRunningInterval: number,
  isUpdatingLastPriceTimestamp: boolean,
  hasCalculatedStateThisUpdate: boolean,
}

export type TotalPoolCommitmentsBN = {
  longMintSettlement: BigNumber;
  longBurnPoolTokens: BigNumber;
  shortMintSettlement: BigNumber;
  shortBurnPoolTokens: BigNumber;
  shortBurnLongMintPoolTokens: BigNumber;
  longBurnShortMintPoolTokens: BigNumber;
  updateIntervalId: BigNumber;
}

export type ExpectedPoolState = {
  timestamp: number,
  currentSkew: BigNumber,
  currentLongBalance: BigNumber,
  currentLongSupply: BigNumber,
  currentShortBalance: BigNumber,
  currentShortSupply: BigNumber,
  expectedSkew: BigNumber,
  expectedLongBalance: BigNumber,
  expectedLongSupply: BigNumber,
  expectedShortBalance: BigNumber,
  expectedShortSupply: BigNumber,
  totalNetPendingLong: BigNumber,
  totalNetPendingShort: BigNumber,
  expectedLongTokenPrice: BigNumber,
  expectedShortTokenPrice: BigNumber,
  lastOraclePrice: BigNumber,
  expectedOraclePrice: BigNumber,
  pendingCommits: TotalPoolCommitmentsBN[]
}

export interface PoolWatcherEvents {
  [EVENT_NAMES.COMMIT]: (data: CommitEventData) => void;
  [EVENT_NAMES.UPKEEP]: (data: UpkeepEventData) => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDED]: () => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDING]: (state: ExpectedPoolState) => void;
  [EVENT_NAMES.COMMITS_EXECUTED]: (data: CommitsExecutedData) => void;
}

export type TotalPoolCommitments = [
  ethers.BigNumber,
  ethers.BigNumber,
  ethers.BigNumber,
  ethers.BigNumber,
  ethers.BigNumber,
  ethers.BigNumber,
  ethers.BigNumber
] & {
  longMintSettlement: ethers.BigNumber;
  longBurnPoolTokens: ethers.BigNumber;
  shortMintSettlement: ethers.BigNumber;
  shortBurnPoolTokens: ethers.BigNumber;
  shortBurnLongMintPoolTokens: ethers.BigNumber;
  longBurnShortMintPoolTokens: ethers.BigNumber;
  updateIntervalId: ethers.BigNumber;
}

export type ExpectedPoolStateInputs = {
  leverage: number,
  longBalance: BigNumber,
  shortBalance: BigNumber,
  longTokenSupply: BigNumber,
  shortTokenSupply: BigNumber,
  lastOraclePrice: BigNumber,
  currentOraclePrice: BigNumber,
  pendingCommits: Array<TotalPoolCommitmentsBN>
}
