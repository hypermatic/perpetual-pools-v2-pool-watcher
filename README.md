# Perpetual Pools v2 Pool Watcher

The Pool Watcher is a building block that can be used to create various types of bots that interact with Tracer Perpetual Pools v2

**This package is for use with perpetual pools v2 which is currently not deployed to mainnet**

# Summary

The Pool Watcher is essentially an event emitter that can be used to monitor the state of a given perpetual pool.

The Pool Watcher will emit an event when the commitment window is nearing the end and will provide details of the current and expected (after next upkeep) of the pool.

This can be used to build arbitrage bots, skew farming bots and other types of trading bots.

# Usage

Install the pool watcher
```
yarn add @tracer-protocol/perpetual-pools-v2-pool-watcher
```

Start watching a pool and reacting to events

``` javascript
import { PoolWatcher } from '@tracer-protocol/perpetual-pools-v2-pool-watcher';

async function main () {
  const poolWatcher = new PoolWatcher({
    nodeUrl: 'your_node_url',
    commitmentWindowBuffer: 20, // calculate and emit expected state 20 seconds before expected end of commitment window
    chainId: '421611', // arbitrum rinkeby
    poolAddress: '0xd9991942bc6d916a8c591f888e8e81fab4cc254d' // 3-ETH/USD testnet pool
  });

  // be sure to initialise the pool
  await poolWatcher.initializeWatchedPool();

  // begin monitoring pool and emitting events
  poolWatcher.startWatchingPool();

  poolWatcher.on('COMMITMENT_WINDOW_ENDING', calculatedState => {
    // use calculatedState to determine a desirable commit to make
    const myCommit = buildACommit(calculatedState);
    // check if you are still within the same update interval before committing
    const { appropriateUpdateIntervalId } = calculatedState;
    const stillInSameInterval = await poolWatcher.isCommitmentWindowStillOpen(appropriateUpdateIntervalId)

    if(!stillInSameInterval) {
      // consider abandoning since your commit will not be included in the next upkeep
    }

    await commit(myCommit)
  })

  poolWatcher.on('COMMIT', commitData => {
    // do whatever you want with the newly observed commit
  })

  poolWatcher.on('UPKEEP', data => {
    // do whatever you want with the newly observed upkeep
  })
}

main();

```


# Constructor Config

| Name                   | Type                                                     | Description                                                                                | Required |
|------------------------|----------------------------------------------------------|--------------------------------------------------------------------------------------------|----------|
| nodeUrl                | string                                                   | url of provider, **websocket provider recommended**                                        | true     |
| poolAddress            | string                                                   | address of pool to watch                                                                   | true     |
| chainId                | string                                                   | chainId of network, only arbitrum networks are supported                                   | true     |
| commitmentWindowBuffer | string                                                   | number of seconds before end of commitment window to emit `COMMITMENT_WINDOW_ENDING` event | true     |
| oraclePriceTransformer | (ethers.BigNumber, ethers.BigNumber) => ethers.BigNumber | price transformation function, used to emulate contract behaviour                          | false    |

# Events

## COMMITMENT_WINDOW_ENDING

This event is emitted once the end of the commitment window is within `commitmentWindowBuffer` seconds from ending.

This can be used to time your commits such that they are as late as possible in the commitment window.

Since `frontRunningInterval` is timestamp based, it is advised to give yourself some leeway via `commitmentWindowBuffer`
to account for unpredictable block timestamps in arbitrum.

The following data containing the expected pool state will be passed into the callback of subscribed event listeners:
| Name                        | Type        | Description                                                                           |
|-----------------------------|-------------|---------------------------------------------------------------------------------------|
| timestamp                   | number      | local unix timestamp when this expected state was calculated                          |
| currentSkew                 | `BigNumber` | current skew (before pending commits are applied in the next upkeep)                  |
| currentLongBalance          | `BigNumber` | current collateral held by long side of the pool                                      |
| currentLongSupply           | `BigNumber` | current supply of long tokens                                                         |
| currentShortBalance         | `BigNumber` | current collateral held by short side of the pool                                     |
| currentShortSupply          | `BigNumber` | current supply of short tokens                                                        |
| expectedSkew                | `BigNumber` | expected skew (after pending commits are applied in the next upkeep)                  |
| expectedLongBalance         | `BigNumber` | expected collateral held by long side of the pool                                     |
| expectedLongSupply          | `BigNumber` | expected supply of long tokens                                                        |
| expectedShortBalance        | `BigNumber` | expected collateral held by short side of the pool                                    |
| expectedShortSupply         | `BigNumber` | expected supply of short tokens                                                       |
| totalNetPendingLong         | `BigNumber` | expected change in long side collateral held                                          |
| totalNetPendingShort        | `BigNumber` | expected change in short side collateral held                                         |
| expectedLongTokenPrice      | `BigNumber` | expected long token price after next upkeep                                           |
| expectedShortTokenPrice     | `BigNumber` | expected short token price after next upkeep                                          |
| lastOraclePrice             | `BigNumber` | last reported oracle price                                                            |
| expectedOraclePrice         | `BigNumber` | expected oracle price after applying oraclePriceTransformer for each expected interval|
| pendingCommits              | `TotalPoolCommitmentsBN[]`| pending commits for each expected upcoming update interval              |

## UPKEEP

This event is emitted when an upkeep is observed for the watched pool.

The following data will be passed into the callback of subscribed event listeners:
| Name                   | Type        | Description                                                                                |
|------------------------|-------------|--------------------------------------------------------------------------------------------|
| poolAddress            | string      | address of pool to watch                                                                   |
| data                   | string      | hex encoded `OracleWrapper` implementation-specific metadata                               |
| startPrice             | `BigNumber` | oracle price at previous upkeep                                                            |
| endPrice               | `BigNumber` | oracle price at this upkeep                                                                |
| timestamp              | number      | unix timestamp of block where event was emitted                                            |
| blockNumber            | number      | block number in which event was emitted                                                    |
| txHash                 | string      | hash of transaction in which event was emitted                                             |

## COMMIT

This event is emitted when a new commit is observed for the watched pool.

The following data will be passed into the callback of subscribed event listeners:
| Name                   | Type        | Description                                                                                                     |
|------------------------|-------------|-----------------------------------------------------------------------------------------------------------------|
| user                   | string      | address of account that created the commit                                                                      |
| amount                 | `BigNumber` | amount of collateral for mint commits, amount of pool tokens for burn commits                                   |
| commitType             | number      | raw commit type, one of {0, 1, 2, 3, 4, 5}                                                                      |
| appropriateIntervalId  | number      | the update interval in which this commit will be executed                                                       |
| payForClaim            | boolean     | true if requesting tokens are claimed on users behalf, false if tokens are to go into escrow (unclaimed balance)|
| fromAggregateBalance   | boolean     | true if paying from unclaimed (escrow) balance, false if paying from wallet                                     |
| mintingFee             | string      | minting fee percentage at time of commit, 128 bit (quad precision) floating point encoded                       |
| timestamp              | number      | unix timestamp of block where event was emitted                                                                 |
| blockNumber            | number      | block number in which event was emitted                                                                         |
| txHash                 | string      | hash of transaction in which event was emitted                                                                  |
