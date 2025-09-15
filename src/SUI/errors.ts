import { ServerError } from '@/app/errors';
import { SUI_MIN_STAKE } from '@/SUI/constants';

export class SuiInvalidSplitStakeAmountError extends ServerError {
  constructor() {
    super(422, `Invalid stake split: both resulting stakes after split must be greater than ${SUI_MIN_STAKE} SUI.`);
  }
}

export class SuiStakeBalanceNotFoundError extends ServerError {
  constructor(stake_id: string) {
    super(422, `Object ${stake_id} is not a stake or does not have a balance field.`);
  }
}

export class SuiInvalidStakeIdError extends ServerError {
  constructor(stake_id: string) {
    super(422, `Object ${stake_id} is not a stake.`);
  }
}
