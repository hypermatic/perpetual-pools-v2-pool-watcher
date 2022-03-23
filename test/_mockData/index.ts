import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';
import { jest } from '@jest/globals';

import type { LeveragedPool, PoolSwapLibrary } from '../../src/typesV2';
import { PoolWatcher } from '../../src/PoolWatcher';
import { PoolWatcherConstructorArgs, TotalPoolCommitmentsBN } from '../../src/types';

// this this is a non-mocked copy of ethers
// since data/functions from this file will be used in tests
// we need to make sure we are not using a mocked ethers accidentally
const actualEthers = jest.requireActual('ethers') as typeof ethers;

export const constructorDefaults = {
  nodeUrl: 'https://rinkeby.arbitrum.io/rpc',
  commitmentWindowBuffer: 10,
  chainId: '421611',
  poolAddress: '0xd9991942bc6d916a8c591f888e8e81fab4cc254d'
};

export const getMockPendingCommits = (overrides?: Partial<TotalPoolCommitmentsBN>): TotalPoolCommitmentsBN => {
  return {
    longMintAmount: new BigNumber(0),
    longBurnAmount: new BigNumber(0),
    shortMintAmount: new BigNumber(0),
    shortBurnAmount: new BigNumber(0),
    shortBurnLongMintAmount: new BigNumber(0),
    longBurnShortMintAmount: new BigNumber(0),
    updateIntervalId: new BigNumber(1),
    ...overrides
  };
};

export const expectedStateInputDefaults = {
  leverage: 3,
  longBalance: new BigNumber('120000000000000000000000'),
  shortBalance: new BigNumber('100000000000000000000000'),
  longTokenSupply: new BigNumber('100000000000000000000000'),
  shortTokenSupply: new BigNumber('100000000000000000000000'),
  lastOraclePrice: new BigNumber('100000000000000000000000'),
  currentOraclePrice: new BigNumber('110000000000000000000000'),
  pendingCommits: [
    getMockPendingCommits()
  ]
};

export const mockPoolData = {
  poolName: 'MOCK-3-ETH/USD',
  keeper: '0x015b7a809B18cf541A99596a29cd0dF81aE8f55e',
  poolCommitter: '0xa321c542a23f5173361f29c3809FAa74C25dAB46',
  updateInterval: '300',
  leverageAmount: '3',
  frontRunningInterval: '30',
  quoteToken: '0x3ebDcefA6a4721a61c7BB6047fe9ca0214985798',
  longToken: '0xD43519F7D604d0c486D90d1aCE38235d432874f1',
  shortToken: '0x4aDe19AF0f3d1b3C10015fA4B353962DD805e0f6',
  lastPriceTimestamp: '1644496867'
};

export const getInitializedMockPoolWatcher = async ({
  constructorArgs,
  mockLeveragedPoolFactory,
  mockPoolSwapLibraryFactory
}: {
  constructorArgs: PoolWatcherConstructorArgs,
  mockLeveragedPoolFactory: any,
  mockPoolSwapLibraryFactory: any,
}): Promise<PoolWatcher> => {
  const mockPoolInstance = {
    poolName: async () => mockPoolData.poolName,
    keeper: async () => mockPoolData.keeper,
    poolCommitter: async () => mockPoolData.poolCommitter,
    updateInterval: async () => mockPoolData.updateInterval,
    leverageAmount: async () => mockPoolData.leverageAmount,
    frontRunningInterval: async () => mockPoolData.frontRunningInterval,
    quoteToken: async () => mockPoolData.quoteToken,
    tokens: async (index: number) => index === 0
      ? mockPoolData.longToken
      : mockPoolData.shortToken,
    lastPriceTimestamp: async () => actualEthers.BigNumber.from(1644496867)
  } as unknown as LeveragedPool;

  const mockPoolSwapLibraryInstance = {
    convertDecimalToUInt: async (raw: string) => actualEthers.BigNumber.from(Number(raw))
  } as unknown as PoolSwapLibrary;

  mockLeveragedPoolFactory.connect.mockReturnValueOnce(mockPoolInstance);
  mockPoolSwapLibraryFactory.connect.mockReturnValueOnce(mockPoolSwapLibraryInstance);

  const poolWatcher = new PoolWatcher(constructorArgs);

  await poolWatcher.initializeWatchedPool();

  return poolWatcher;
};
