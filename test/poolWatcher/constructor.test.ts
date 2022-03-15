
import {
  describe,
  test,
  expect,
  jest,
  beforeEach
} from '@jest/globals';

import {
  LeveragedPool__factory,
  LeveragedPool,
  PoolSwapLibrary__factory,
  PoolSwapLibrary
} from '../../src/typesV2';

import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import { PoolWatcher } from '../../src/PoolWatcher';

jest.mock('ethers');
jest.mock('../../src/typesV2'); ;

const mockedEthers = jest.mocked(ethers, true);
const mockLeveragedPoolFactory = jest.mocked(LeveragedPool__factory, true);
const mockPoolSwapLibraryFactory = jest.mocked(PoolSwapLibrary__factory, true);

export const constructorTestDefaults = {
  nodeUrl: 'https://rinkeby.arbitrum.io/rpc',
  commitmentWindowBuffer: 10,
  chainId: '421611',
  poolAddress: '0xd9991942bc6d916a8c591f888e8e81fab4cc254d'
};

describe('PoolWatcher constructor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('it throws an error for unsupported chainId\'s', () => {
    expect(() => new PoolWatcher({
      ...constructorTestDefaults,
      chainId: 'wrong'
    })).toThrowError('unsupported chainId: wrong, supported values are [421611]');
  });

  test('`this.provider` is assigned a provider instance with the given node url', () => {
    const mockProvider = {} as unknown as ethers.providers.BaseProvider;

    mockedEthers.getDefaultProvider.mockReturnValueOnce(mockProvider);

    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.provider).toBe(mockProvider);
  });

  test('`this.poolInstance` is assigned a LeveragedPool instance', () => {
    const mockPoolInstance = {} as unknown as LeveragedPool;

    mockLeveragedPoolFactory.connect.mockReturnValueOnce(mockPoolInstance);

    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.poolInstance).toBe(mockPoolInstance);
  });

  test('`this.poolSwapLibrary` is assigned an instance of pool swap library', () => {
    const mockPoolSwapLibrary = {} as unknown as PoolSwapLibrary;

    mockPoolSwapLibraryFactory.connect.mockReturnValueOnce(mockPoolSwapLibrary);

    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.poolSwapLibrary).toBe(mockPoolSwapLibrary);
  });

  test('`this.poolAddress` is assigned the provided value', () => {
    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.poolAddress).toEqual(constructorTestDefaults.poolAddress);
  });

  test('`this.chainId` is assigned the provided value', () => {
    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.chainId).toEqual(constructorTestDefaults.chainId);
  });

  test('`this.watchedPool` starts as an empty object', () => {
    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.watchedPool).toEqual({});
  });

  test('`this.commitmentWindowBuffer` is assigned the correct address for the chainId', () => {
    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.commitmentWindowBuffer).toEqual(constructorTestDefaults.commitmentWindowBuffer);
  });

  test('`this.isWatching` is false by default', () => {
    const poolWatcher = new PoolWatcher(constructorTestDefaults);

    expect(poolWatcher.isWatching).toEqual(false);
  });

  test('`this.oraclePriceTransformer` is assigned the given function', () => {
    const mockPriceTransformer = (lastPrice: BigNumber, currentPrice: BigNumber) => lastPrice.plus(currentPrice);

    const poolWatcher = new PoolWatcher({
      ...constructorTestDefaults,
      oraclePriceTransformer: mockPriceTransformer
    });

    expect(poolWatcher.isWatching).toEqual(false);
  });
});
