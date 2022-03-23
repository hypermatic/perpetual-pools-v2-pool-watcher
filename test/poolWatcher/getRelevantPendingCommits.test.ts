
import {
  describe,
  test,
  expect,
  jest,
  beforeEach
} from '@jest/globals';

import {
  LeveragedPool__factory,
  PoolSwapLibrary__factory,
  PoolCommitter__factory
} from '../../src/typesV2';

import {
  constructorDefaults,
  getInitializedMockPoolWatcher
} from '../_mockData';

import { PoolWatcherConstructorArgs } from '../../src/types';

jest.mock('ethers');
jest.mock('../../src/typesV2'); ;

const mockLeveragedPoolFactory = jest.mocked(LeveragedPool__factory, true);
const mockPoolSwapLibraryFactory = jest.mocked(PoolSwapLibrary__factory, true);
const mockPoolCommitterFactory = jest.mocked(PoolCommitter__factory, true);

const spotOracleTransformer: PoolWatcherConstructorArgs['oraclePriceTransformer'] = (lastPrice, newPrice) => newPrice;

describe('PoolWatcher getRelevantPendingCommits', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('[frontRunningInterval < updateInterval] fetches pending commits for the current update interval', async () => {
    const poolWatcher = await getInitializedMockPoolWatcher({
      constructorArgs: constructorDefaults,
      _mockPoolData: {
        frontRunningInterval: 30,
        updateInterval: 300
      },
      mockLeveragedPoolFactory,
      mockPoolSwapLibraryFactory,
      mockPoolCommitterFactory
    });

    const getPendingCommitsSpy = jest.spyOn(poolWatcher.watchedPool.committerInstance, 'getPendingCommits');

    const pendingCommits = await poolWatcher.getRelevantPendingCommits();

    expect(pendingCommits.length).toEqual(1);
    // single call with no arguments
    expect(getPendingCommitsSpy.mock.calls).toEqual([[]]);
  });

  test('[frontRunningInterval == updateInterval] fetches pending commits for the next 2 intervals', async () => {
    const poolWatcher = await getInitializedMockPoolWatcher({
      constructorArgs: constructorDefaults,
      _mockPoolData: {
        frontRunningInterval: 300,
        updateInterval: 300
      },
      mockLeveragedPoolFactory,
      mockPoolSwapLibraryFactory,
      mockPoolCommitterFactory
    });

    const totalPoolCommitmentsSpy = jest.spyOn(poolWatcher.watchedPool.committerInstance, 'totalPoolCommitments');

    const pendingCommits = await poolWatcher.getRelevantPendingCommits();

    expect(pendingCommits.length).toEqual(2);
    // current update interval id is mocked to be 1
    expect(totalPoolCommitmentsSpy.mock.calls).toEqual([
      [1],
      [2]
    ]);
  });

  test('[frontRunningInterval > updateInterval] fetches pending commits for the next n intervals', async () => {
    const poolWatcher = await getInitializedMockPoolWatcher({
      constructorArgs: {
        ...constructorDefaults,
        // spot oracle
        oraclePriceTransformer: spotOracleTransformer
      },
      _mockPoolData: {
        frontRunningInterval: 1500,
        updateInterval: 300
      },
      mockLeveragedPoolFactory,
      mockPoolSwapLibraryFactory,
      mockPoolCommitterFactory
    });

    const totalPoolCommitmentsSpy = jest.spyOn(poolWatcher.watchedPool.committerInstance, 'totalPoolCommitments');

    const pendingCommits = await poolWatcher.getRelevantPendingCommits();

    expect(pendingCommits.length).toEqual(6);
    // current update interval id is mocked to be 1
    expect(totalPoolCommitmentsSpy.mock.calls).toEqual([
      [1],
      [2],
      [3],
      [4],
      [5],
      [6]
    ]);
  });
});
