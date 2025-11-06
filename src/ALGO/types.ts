import type algosdk from 'algosdk';

export type AlgoTx = {
  unsigned_txs_serialized: string[];
};

export type TransactionGroup = algosdk.Transaction[];

/**
 * Validator configuration returned from the RETI protocol
 * Based on: https://github.com/algorandfoundation/reti/blob/dev/contracts/contracts/validatorConfigs.algo.ts
 */
export type ValidatorConfig = [
  id: bigint, // 0
  owner: string, // 1
  manager: string, // 2
  nfdForInfo: bigint, // 3
  entryGatingType: number, // 4
  entryGatingAddress: string, // 5
  entryGatingAssets: [bigint, bigint, bigint, bigint], // 6
  gatingAssetMinBalance: bigint, // 7
  rewardTokenId: bigint, // 8
  rewardPerPayout: bigint, // 9
  epochRoundLength: bigint, // 10
  percentToValidator: number, // 11
  validatorCommissionAddress: string, // 12
  minEntryStake: bigint, // 13
  maxAlgoPerPool: bigint, // 14
  poolsPerNode: number, // 15
  sunsettingOn: bigint, // 16
  sunsettingTo: bigint, // 17
];

/**
 * Result from findPoolForStaker
 * Based on: https://github.com/algorandfoundation/reti/blob/dev/contracts/contracts/validatorRegistry.algo.ts
 */
export type PoolForStakerResult = [
  poolKey: [id: bigint, poolId: bigint, poolAppId: bigint], // 0
  isNewStakerToValidator: boolean, // 1
  isNewStakerToProtocol: boolean, // 2
];

/**
 * Staker information returned from pool contract
 * Based on: https://github.com/algorandfoundation/reti/blob/dev/contracts/contracts/stakingPool.algo.ts
 */
export type StakerInfo = [
  account: string, // 0
  balance: bigint, // 1
  totalRewarded: bigint, // 2
  rewardTokenBalance: bigint, // 3
  entryRound: bigint, // 4
];
