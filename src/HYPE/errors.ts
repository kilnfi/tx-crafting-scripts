import { BaseError } from '@/app/errors';

export class HypeInvalidAmountError extends BaseError {
  constructor(amount: string) {
    super(422, `Invalid amount_wei ${amount}: expected a positive integer below 2^53.`);
  }
}

export class HypeInvalidTxError extends BaseError {
  constructor(reason: string) {
    super(422, `Invalid Hyperliquid transaction: ${reason}.`);
  }
}

export class HypeSignerMismatchError extends BaseError {
  constructor(expected: string, actual: string) {
    super(422, `The transaction was signed by ${actual}, expected the wallet ${expected}.`);
  }
}
