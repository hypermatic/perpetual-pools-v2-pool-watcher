
import {
  describe,
  test,
  expect,
  jest,
  beforeEach
} from '@jest/globals';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import {
  LeveragedPool__factory,
  LeveragedPool,
  PoolSwapLibrary__factory,
  PoolSwapLibrary
} from '@tracer-protocol/perpetual-pools-contracts/types';

import { PoolWatcher } from '../../src/PoolWatcher';
import { constructorDefaults } from '../_mockData';

jest.mock('ethers');
jest.mock('@tracer-protocol/perpetual-pools-contracts/types'); ;

const mockedEthers = jest.mocked(ethers, true);
const mockLeveragedPoolFactory = jest.mocked(LeveragedPool__factory, true);
const mockPoolSwapLibraryFactory = jest.mocked(PoolSwapLibrary__factory, true);

describe('PoolWatcher constructor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('it throws an error for unsupported chainId\'s', () => {
    expect(() => new PoolWatcher({
      ...constructorDefaults,
      chainId: 'wrong'
    })).toThrowError('unsupported chainId: wrong, supported values are [421611]');
  });

  test('`this.provider` is assigned a provider instance with the given node url', () => {
    const mockProvider = {} as unknown as ethers.providers.BaseProvider;

    mockedEthers.getDefaultProvider.mockReturnValueOnce(mockProvider);

    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.provider).toBe(mockProvider);
  });

  test('`this.poolInstance` is assigned a LeveragedPool instance', () => {
    const mockPoolInstance = {} as unknown as LeveragedPool;

    mockLeveragedPoolFactory.connect.mockReturnValueOnce(mockPoolInstance);

    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.poolInstance).toBe(mockPoolInstance);
  });

  test('`this.poolSwapLibrary` is assigned an instance of pool swap library', () => {
    const mockPoolSwapLibrary = {} as unknown as PoolSwapLibrary;

    mockPoolSwapLibraryFactory.connect.mockReturnValueOnce(mockPoolSwapLibrary);

    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.poolSwapLibrary).toBe(mockPoolSwapLibrary);
  });

  test('`this.poolAddress` is assigned the provided value', () => {
    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.poolAddress).toEqual(constructorDefaults.poolAddress);
  });

  test('`this.chainId` is assigned the provided value', () => {
    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.chainId).toEqual(constructorDefaults.chainId);
  });

  test('`this.watchedPool` starts as an empty object', () => {
    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.watchedPool).toEqual({});
  });

  test('`this.commitmentWindowBuffer` is assigned the correct address for the chainId', () => {
    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.commitmentWindowBuffer).toEqual(constructorDefaults.commitmentWindowBuffer);
  });

  test('`this.isWatching` is false by default', () => {
    const poolWatcher = new PoolWatcher(constructorDefaults);

    expect(poolWatcher.isWatching).toEqual(false);
  });

  test('`this.oraclePriceTransformer` is assigned the given function', () => {
    const mockPriceTransformer = (lastPrice: BigNumber, currentPrice: BigNumber) => lastPrice.plus(currentPrice);

    const poolWatcher = new PoolWatcher({
      ...constructorDefaults,
      oraclePriceTransformer: mockPriceTransformer
    });

    expect(poolWatcher.isWatching).toEqual(false);
  });
});
