import { BigNumber } from 'bignumber.js';
import { NETWORKS } from '@tracer-protocol/pools-js';

// a util function to attempt a promise recursively until it resolves
// this is useful to mitigate errors caused by calls to nodes failing randomly
export const attemptPromiseRecursively = async <T>({
  promise,
  retryCheck,
  maxAttempts = 3,
  interval = 1000,
  attemptCount = 1
}: {
  promise: () => Promise<T>
  retryCheck?: (error: any) => Promise<boolean>
  maxAttempts?: number
  interval?: number
  attemptCount?: number
}): Promise<T> => {
  try {
    const result = await promise();
    return result;
  } catch (error: any) {
    if (attemptCount >= maxAttempts) {
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, interval));

    if (!retryCheck || (retryCheck && await retryCheck(error))) {
      return attemptPromiseRecursively({ promise, retryCheck, interval, maxAttempts, attemptCount: attemptCount + 1 });
    } else {
      throw error;
    }
  }
};

export const poolSwapLibraryAddresses: Record<string, string> = {
  [NETWORKS.ARBITRUM_RINKEBY]: '0xCB27C3813D75918f8B764143Cf3717955A5D43b8',
  [NETWORKS.ARBITRUM]: '0x928d5a6668Bc9b801229c176c0bEB3b34Afba5d8'
};

export const movingAveragePriceTransformer = (lastPrice: BigNumber, currentPrice: BigNumber) => {
  return lastPrice.plus(currentPrice).div(2);
};
