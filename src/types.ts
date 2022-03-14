import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

// TODO: update to latest version after redeploy/abis are provided via sdk or other package
import {
  ERC20,
  PoolCommitter,
  PoolKeeper
} from './typesV2';

export type RawCommitType = 0 | 1 | 2 | 3 | 4 | 5

export type CommitEventData = {
  user: string,
  amount: BigNumber,
  commitType: RawCommitType,
  appropriateIntervalId: number,
  mintingFee: string
}

export type UpkeepEventData = {
  poolAddress: string,
  data: string,
  startPrice: BigNumber,
  endPrice: BigNumber
}

export type PoolWatcherConstructorArgs = {
  nodeUrl: string
  poolAddress: string
  chainId: string
  commitmentWindowBuffer: number
  oraclePriceTransformer?: (lastPrice: BigNumber, currentPrice: BigNumber) => BigNumber
}

export type WatchedPool = {
  address: string,
  name: string,
  keeperInstance: PoolKeeper,
  updateInterval: number,
  lastPriceTimestamp: number,
  leverage: number,
  longTokenInstance: ERC20,
  shortTokenInstance: ERC20,
  quoteTokenInstance: ERC20,
  committerInstance: PoolCommitter,
  frontRunningInterval: number,
  isUpdatingLastPriceTimestamp: boolean,
  hasCalculatedStateThisUpdate: boolean,
}

export type CalculatedPoolState = {
  timestamp: number,
  appropriateUpdateIntervalId: number,
  currentSkew: number,
  currentLongBalance: BigNumber,
  currentLongSupply: BigNumber,
  currentShortBalance: BigNumber,
  currentShortSupply: BigNumber,
  expectedSkew: number,
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
  longMintAmount: ethers.BigNumber;
  longBurnAmount: ethers.BigNumber;
  shortMintAmount: ethers.BigNumber;
  shortBurnAmount: ethers.BigNumber;
  shortBurnLongMintAmount: ethers.BigNumber;
  longBurnShortMintAmount: ethers.BigNumber;
  updateIntervalId: ethers.BigNumber;
}

export type TotalPoolCommitmentsBN = {
  longMintAmount: BigNumber;
  longBurnAmount: BigNumber;
  shortMintAmount: BigNumber;
  shortBurnAmount: BigNumber;
  shortBurnLongMintAmount: BigNumber;
  longBurnShortMintAmount: BigNumber;
  updateIntervalId: BigNumber;
}
