import { ServerError } from '@/errors/errors';

export class InjAddressDerivationMismatchError extends ServerError {
  constructor(address: string, pubkey: string) {
    super(422, `Address ${address} does not derive from the given public key ${pubkey}.`);
  }
}

export class CosmosCannotRedelegateToSameValidatorError extends ServerError {
  constructor(validator_source: string) {
    super(422, `Cannot redelegate to the same validator ${validator_source}.`);
  }
}

export class CosmosPublicKeyNotDelegatedToSourceValidatorError extends ServerError {
  constructor(pubkey: string, validator_source: string) {
    super(422, `This public key ${pubkey} is not delegated to the source validator ${validator_source}.`);
  }
}

export class CosmosPublicKeyNotDelegatedToValidatorError extends ServerError {
  constructor(pubkey: string, validator: string) {
    super(422, `This public key ${pubkey} is not delegated to the validator ${validator}.`);
  }
}
