import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ServerError } from '@/app/errors';

export class SolStakeAccountNotFoundError extends ServerError {
  constructor(stake_account: string) {
    super(404, `Stake account ${stake_account} not found.`);
  }
}

export class SolWalletNotOwnerOfStakeAccountError extends ServerError {
  constructor(wallet: string, stake_account: string) {
    super(422, `The wallet ${wallet} is not the owner of the stake account ${stake_account}.`);
  }
}

export class SolStakeAccountInsufficientBalanceError extends ServerError {
  constructor(stake_account: string, withdrawable_balance: string) {
    super(422, `The stake account ${stake_account} does not have enough balance to withdraw ${withdrawable_balance}.`);
  }
}

export class SolStakeAccountStillActiveError extends ServerError {
  constructor(stake_account: string) {
    super(422, `The stake account ${stake_account} is still active. Please deactivate it first.`);
  }
}

export class SolAmountLessThanMinimumDelegationError extends ServerError {
  constructor(minimum: number) {
    super(
      422,
      `Amount is less than the "rent exempt reserve" + "minimum delegation" (${minimum / LAMPORTS_PER_SOL} SOL).`,
    );
  }
}

export class SolFailedToEstimateGas extends ServerError {
  constructor(err: unknown) {
    super(422, 'Error during transaction simulation.', err);
  }
}

export class SolFeePayerCannotBeNonceAccountError extends ServerError {
  constructor() {
    super(422, 'The fee payer cannot be the nonce account');
  }
}
