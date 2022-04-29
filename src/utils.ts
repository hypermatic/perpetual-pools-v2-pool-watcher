import { BigNumber } from 'bignumber.js';

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
  421611: '0x8e761005bAFB81CEde15366158B1F769a411dDfc'
};

export const movingAveragePriceTransformer = (lastPrice: BigNumber, currentPrice: BigNumber) => {
  return lastPrice.plus(currentPrice).div(2);
};
