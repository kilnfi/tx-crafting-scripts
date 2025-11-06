import { BaseError } from '@/app/errors';

export class AlgoMinimumStakeNotMetError extends BaseError {
  constructor(stakeAmount: string, minStake: string) {
    super(
      422,
      `Stake amount ${stakeAmount} ALGO does not meet the minimum entry stake requirement of ${minStake} ALGO for new stakers to this validator.`,
    );
  }
}

export class AlgoInvalidSignatureError extends BaseError {
  constructor(txIndex: number) {
    super(422, `Invalid signature for transaction at index ${txIndex}.`);
  }
}

export class AlgoTransactionGroupMismatchError extends BaseError {
  constructor(txCount: number, sigCount: number) {
    super(422, `Transaction count (${txCount}) does not match signature count (${sigCount}).`);
  }
}

export class AlgoValidatorConfigError extends BaseError {
  constructor(failureMessage: string) {
    super(422, `Failed to get validator config: ${failureMessage}`);
  }
}

export class AlgoFindPoolError extends BaseError {
  constructor(failureMessage: string) {
    super(422, `Failed to find pool for staker: ${failureMessage}`);
  }
}

export class AlgoGetStakerInfoError extends BaseError {
  constructor(failureMessage: string) {
    super(422, `Failed to get staker info: ${failureMessage}`);
  }
}

export class AlgoMinimumEntryStakeError extends BaseError {
  constructor(amount: string, minEntryStake: string) {
    super(
      422,
      `New staker to validator: stake amount ${amount} ALGO is below minimum entry stake ${minEntryStake} ALGO`,
    );
  }
}

export class AlgoInvalidRemoveStakeError extends BaseError {
  constructor(amount: string, remainingBalance: string, minEntryStake: string) {
    super(
      422,
      `Cannot remove ${amount} ALGO: remaining balance of ${remainingBalance} ALGO would be below minimum entry stake of ${minEntryStake} ALGO. Either remove all your staked balance or leave at least the minimum entry stake amount.`,
    );
  }
}
