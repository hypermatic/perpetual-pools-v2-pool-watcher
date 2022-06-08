import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';
import { jest } from '@jest/globals';
import { TotalPoolCommitmentsBN } from '@tracer-protocol/pools-js/types';

import type { ERC20, LeveragedPool, PoolCommitter, PoolSwapLibrary } from '@tracer-protocol/perpetual-pools-contracts/types';
import { PoolWatcher } from '../../src/PoolWatcher';
import { PoolWatcherConstructorArgs } from '../../src/types';

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
    longMintSettlement: new BigNumber(0),
    longBurnPoolTokens: new BigNumber(0),
    shortMintSettlement: new BigNumber(0),
    shortBurnPoolTokens: new BigNumber(0),
    shortBurnLongMintPoolTokens: new BigNumber(0),
    longBurnShortMintPoolTokens: new BigNumber(0),
    ...overrides
  };
};

export const expectedStateInputDefaults = {
  leverage: 3,
  settlementTokenDecimals: 6,
  longBalance: new BigNumber('120000000000000000000000'),
  shortBalance: new BigNumber('100000000000000000000000'),
  longTokenSupply: new BigNumber('90000000000000000000000'),
  shortTokenSupply: new BigNumber('80000000000000000000000'),
  pendingLongTokenBurn: new BigNumber('1000000000000000000000'),
  pendingShortTokenBurn: new BigNumber('2000000000000000000000'),
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
  updateInterval: 300,
  leverageAmount: '3',
  settlementTokenDecimals: 6,
  frontRunningInterval: 30,
  settlementToken: '0x3ebDcefA6a4721a61c7BB6047fe9ca0214985798',
  longToken: '0xD43519F7D604d0c486D90d1aCE38235d432874f1',
  shortToken: '0x4aDe19AF0f3d1b3C10015fA4B353962DD805e0f6',
  lastPriceTimestamp: actualEthers.BigNumber.from(1644496867)
};

export const emptyTotalPoolCommitments = () => {
  const totalPoolCommitments: any = [
    actualEthers.BigNumber.from(0),
    actualEthers.BigNumber.from(0),
    actualEthers.BigNumber.from(0),
    actualEthers.BigNumber.from(0),
    actualEthers.BigNumber.from(0),
    actualEthers.BigNumber.from(0),
    actualEthers.BigNumber.from(0)
  ];

  totalPoolCommitments.longMintSettlement = actualEthers.BigNumber.from(0);
  totalPoolCommitments.longBurnPoolTokens = actualEthers.BigNumber.from(0);
  totalPoolCommitments.shortMintSettlement = actualEthers.BigNumber.from(0);
  totalPoolCommitments.shortBurnPoolTokens = actualEthers.BigNumber.from(0);
  totalPoolCommitments.shortBurnLongMintPoolTokens = actualEthers.BigNumber.from(0);
  totalPoolCommitments.longBurnShortMintPoolTokens = actualEthers.BigNumber.from(0);
  totalPoolCommitments.updateIntervalId = actualEthers.BigNumber.from(0);
  return totalPoolCommitments;
};

export const getInitializedMockPoolWatcher = async ({
  constructorArgs,
  mockLeveragedPoolFactory,
  mockPoolSwapLibraryFactory,
  mockPoolCommitterFactory,
  mockERC20Factory,
  mockSMAOracle,
  _mockPoolData
}: {
  constructorArgs: PoolWatcherConstructorArgs,
  mockLeveragedPoolFactory: any,
  mockPoolSwapLibraryFactory: any,
  mockPoolCommitterFactory: any,
  mockERC20Factory: any,
  mockSMAOracle: any,
  _mockPoolData?: Partial<typeof mockPoolData>,
}): Promise<PoolWatcher> => {
  const mockPoolInstance = {
    poolName: async () => _mockPoolData?.poolName || mockPoolData.poolName,
    keeper: async () => _mockPoolData?.keeper || mockPoolData.keeper,
    oracleWrapper: async () => _mockPoolData?.oracleWrapper || mockPoolData.oracleWrapper,
    poolCommitter: async () => _mockPoolData?.poolCommitter || mockPoolData.poolCommitter,
    updateInterval: async () => _mockPoolData?.updateInterval || mockPoolData.updateInterval,
    leverageAmount: async () => _mockPoolData?.leverageAmount || mockPoolData.leverageAmount,
    frontRunningInterval: async () => _mockPoolData?.frontRunningInterval || mockPoolData.frontRunningInterval,
    settlementToken: async () => _mockPoolData?.settlementToken || mockPoolData.settlementToken,
    tokens: async (index: number) => index === 0
      ? _mockPoolData?.longToken || mockPoolData.longToken
      : _mockPoolData?.shortToken || mockPoolData.shortToken,
    lastPriceTimestamp: async () => actualEthers.BigNumber.from(
      _mockPoolData?.lastPriceTimestamp || mockPoolData.lastPriceTimestamp
    )
  } as unknown as LeveragedPool;

  const mockPoolSwapLibraryInstance = {
    convertDecimalToUInt: async (raw: string) => actualEthers.BigNumber.from(Number(raw))
  } as unknown as PoolSwapLibrary;

  const mockPoolCommitterInstance = {
    getAppropriateUpdateIntervalId: async () => actualEthers.BigNumber.from(2),
    updateIntervalId: async () => actualEthers.BigNumber.from(1),
    getPendingCommits: async () => ([
      emptyTotalPoolCommitments(),
      emptyTotalPoolCommitments()
    ]),
    totalPoolCommitments: async () => emptyTotalPoolCommitments(),
    on: (filter: any, handler: any) => {},
    filters: {
      CreateCommit: () => {}
    }
  } as unknown as PoolCommitter;

  const mockSettlementTokenInstance = {
    decimals: async () => 6
  } as unknown as ERC20;

  mockLeveragedPoolFactory.connect.mockReturnValueOnce(mockPoolInstance);
  mockPoolSwapLibraryFactory.connect.mockReturnValueOnce(mockPoolSwapLibraryInstance);
  mockPoolCommitterFactory.connect.mockReturnValueOnce(mockPoolCommitterInstance);
  mockERC20Factory.connect.mockReturnValueOnce(mockSettlementTokenInstance);
  mockSMAOracle.Create.mockReturnValueOnce({});

  const poolWatcher = new PoolWatcher(constructorArgs);

  await poolWatcher.initializeWatchedPool();

  return poolWatcher;
};
