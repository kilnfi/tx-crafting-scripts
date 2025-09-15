import { BaseError } from '@/app/errors';

export class InjAddressDerivationMismatchError extends BaseError {
  constructor(address: string, pubkey: string) {
    super(422, `Address ${address} does not derive from the given public key ${pubkey}.`);
  }
}

export class CosmosCannotRedelegateToSameValidatorError extends BaseError {
  constructor(validator_source: string) {
    super(422, `Cannot redelegate to the same validator ${validator_source}.`);
  }
}

export class CosmosPublicKeyNotDelegatedToSourceValidatorError extends BaseError {
  constructor(pubkey: string, validator_source: string) {
    super(422, `This public key ${pubkey} is not delegated to the source validator ${validator_source}.`);
  }
}

export class CosmosPublicKeyNotDelegatedToValidatorError extends BaseError {
  constructor(pubkey: string, validator: string) {
    super(422, `This public key ${pubkey} is not delegated to the validator ${validator}.`);
  }
}
