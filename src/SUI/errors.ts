import { BaseError } from '@/app/errors';
import { SUI_MIN_STAKE } from '@/SUI/constants';

export class SuiInvalidSplitStakeAmountError extends BaseError {
  constructor() {
    super(422, `Invalid stake split: both resulting stakes after split must be greater than ${SUI_MIN_STAKE} SUI.`);
  }
}

export class SuiStakeBalanceNotFoundError extends BaseError {
  constructor(stake_id: string) {
    super(422, `Object ${stake_id} is not a stake or does not have a balance field.`);
  }
}

export class SuiInvalidStakeIdError extends BaseError {
  constructor(stake_id: string) {
    super(422, `Object ${stake_id} is not a stake.`);
  }
}
