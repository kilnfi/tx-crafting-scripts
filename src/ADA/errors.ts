import { BaseError } from '@/app/errors';

export class AdaAddressDoesNotHaveStakeRightsError extends BaseError {
  constructor(wallet: string) {
    super(422, `Address ${wallet} does not have stake rights. Please make sure it is not an enterprise address.`);
  }
}

export class AdaWithdrawalAmountExceedsAvailableRewardsError extends BaseError {
  constructor(amount: string, available_rewards: string) {
    super(422, `Amount to withdraw ${amount} is higher than available rewards ${available_rewards}.`);
  }
}
