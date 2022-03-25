import { TypedEmitter } from 'tiny-typed-emitter';

import {
  ExpectedPoolState,
  CommitEventData,
  UpkeepEventData,
  MultiplePoolWatcherConstructorArgs,
  SpecificPool
} from './types';
import { PoolWatcher } from './PoolWatcher';
import { EVENT_NAMES } from './constants';

interface MultiplePoolWatcherEvents {
  [EVENT_NAMES.COMMIT]: (data: CommitEventData & SpecificPool) => void;
  [EVENT_NAMES.UPKEEP]: (data: UpkeepEventData & SpecificPool) => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDED]: (data: SpecificPool) => void;
  [EVENT_NAMES.COMMITMENT_WINDOW_ENDING]: (state: ExpectedPoolState & SpecificPool) => void;
}

export class MultiplePoolWatcher extends TypedEmitter<MultiplePoolWatcherEvents> {
  nodeUrl: string;
  poolAddresses: string[]
  chainId: string
  commitmentWindowBuffer: number

  constructor (args: MultiplePoolWatcherConstructorArgs) {
    super();
    this.nodeUrl = args.nodeUrl;
    this.poolAddresses = args.poolAddresses;
    this.chainId = args.chainId;
    this.commitmentWindowBuffer = args.commitmentWindowBuffer;
  }

  async initializePoolWatchers () {
    return Promise.all(this.poolAddresses.map(async (poolAddress) => {
      const poolWatcher = new PoolWatcher({
        nodeUrl: this.nodeUrl,
        commitmentWindowBuffer: this.commitmentWindowBuffer, // calculate pool state 10 seconds before
        chainId: this.chainId,
        poolAddress
      });

      await poolWatcher.initializeWatchedPool();
      poolWatcher.startWatchingPool();

      poolWatcher.on('COMMITMENT_WINDOW_ENDING', state => {
        this.emit(EVENT_NAMES.COMMITMENT_WINDOW_ENDING, { ...state, poolAddress }); // forwards event
      });

      poolWatcher.on('COMMITMENT_WINDOW_ENDED', () => {
        this.emit(EVENT_NAMES.COMMITMENT_WINDOW_ENDED, { poolAddress }); // forwards event
      });

      poolWatcher.on('COMMIT', commitData => {
        this.emit(EVENT_NAMES.COMMIT, { ...commitData, poolAddress }); // forwards event
      });

      poolWatcher.on('UPKEEP', data => {
        this.emit(EVENT_NAMES.UPKEEP, { ...data, poolAddress }); // forwards event
      });
    }));
  }
}
