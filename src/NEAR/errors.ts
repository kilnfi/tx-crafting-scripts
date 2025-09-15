import { BaseError } from '@/app/errors';

export class NearCouldNotFindWalletAccessKeyError extends BaseError {
  constructor(wallet: string) {
    super(422, `Could not find wallet access key for wallet ${wallet}`);
  }
}
