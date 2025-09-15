import { ServerError } from '@/app/errors';

export class XtzAccountNotRevealedError extends ServerError {
  constructor(wallet: string) {
    super(
      422,
      `To perform transactions or delegate, the wallet ${wallet} must first reveal its public key on the blockchain. Please ensure the account is revealed before proceeding.`,
    );
  }
}

export class XtzWalletNotDelegatedToBakerError extends ServerError {
  constructor(wallet: string) {
    super(422, `Wallet ${wallet} must be delegated to a baker before staking.`);
  }
}

export class XtzCounterUndefinedError extends ServerError {
  constructor(wallet: string) {
    super(422, `Counter of wallet ${wallet} is not defined.`);
  }
}
