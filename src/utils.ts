import { ethers } from 'ethers';
import { BigNumber } from 'bignumber.js';

// a util function to attempt a promise recursively until it resolves
// this is useful to mitigate errors caused by calls to nodes failing randomly
export const attemptPromiseRecursively = async <T>({
  promise,
  retryCheck,
  interval = 1000
}: {
  promise: () => Promise<T>,
  retryCheck?: (error: any) => Promise<boolean>,
  interval?: number
}): Promise<T> => {
  try {
    return await promise();
  } catch (error: any) {
    await new Promise(resolve => setTimeout(resolve, interval));

    if (!retryCheck || (retryCheck && await retryCheck(error))) {
      return attemptPromiseRecursively({ promise, retryCheck, interval });
    } else {
      return undefined as unknown as T;
    }
  }
};

export const ethersBNtoBN = (ethersBN: ethers.BigNumber): BigNumber => {
  return new BigNumber(ethersBN.toString());
};

export const poolSwapLibraryAddresses: Record<string, string> = {
  421611: '0x8e761005bAFB81CEde15366158B1F769a411dDfc'
};

export const movingAveragePriceTransformer = (lastPrice: BigNumber, currentPrice: BigNumber) => {
  return lastPrice.plus(currentPrice).div(2);
};
