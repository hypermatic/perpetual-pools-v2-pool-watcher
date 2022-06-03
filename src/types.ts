import { TotalPoolCommitmentsBN } from '@tracer-protocol/pools-js/types';
import BigNumber from 'bignumber.js';

// TODO: update to latest version after redeploy/abis are provided via sdk or other package
import {
  ERC20,
  PoolCommitter,
  PoolKeeper
} from '@tracer-protocol/perpetual-pools-contracts/types';

import { EVENT_NAMES } from './constants';
import { SMAOracle } from '@tracer-protocol/pools-js';

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
  txHash: string,
  settlementTokenDecimals: number;
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
  settlementTokenDecimals: number,
  keeperInstance: PoolKeeper,
  smaOracle: SMAOracle,
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

export type ExpectedPoolStateWithUpdateIntervalId = ExpectedPoolState & {
  updateIntervalId: BigNumber
}

export interface PoolWatcherEvents {
  [EVENT_NAMES.COMMIT]: (data: CommitEventData) => void;
  [EVENT_NAMES.UPKEEP]: (data: UpkeepEventData) => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDED]: () => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDING]: (state: ExpectedPoolStateWithUpdateIntervalId) => void;
  [EVENT_NAMES.COMMITS_EXECUTED]: (data: CommitsExecutedData) => void;
}

export interface MultiplePoolWatcherEvents {
  [EVENT_NAMES.COMMIT]: (data: CommitEventData & SpecificPool) => void;
  [EVENT_NAMES.UPKEEP]: (data: UpkeepEventData & SpecificPool) => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDED]: (data: SpecificPool) => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDING]: (state: ExpectedPoolStateWithUpdateIntervalId & SpecificPool) => void;
  [EVENT_NAMES.COMMITS_EXECUTED]: (data: CommitsExecutedData & SpecificPool) => void;
}
