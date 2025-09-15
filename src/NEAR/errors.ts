import { ServerError } from '@/errors/errors';

export class NearCouldNotFindWalletAccessKeyError extends ServerError {
  constructor(wallet: string) {
    super(422, `Could not find wallet access key for wallet ${wallet}`);
  }
}
