import { BaseError } from '@/app/errors';

export class TonPoolNotActiveError extends BaseError {
  constructor(pool_address: string) {
    super(422, `Pool ${pool_address} is not active.`);
  }
}

export class TonWalletNotOwnerOfVestingContractError extends BaseError {
  constructor(wallet: string, vesting_contract_address: string) {
    super(422, `Your wallet ${wallet} is not the owner of the vesting contract ${vesting_contract_address}.`);
  }
}

export class TonVestingContractNotOwnerOfPoolError extends BaseError {
  constructor(vesting_contract_address: string, pool_address: string) {
    super(422, `Vesting contract ${vesting_contract_address} is not the owner the pool ${pool_address}.`);
  }
}

export class TonWalletNotActiveError extends BaseError {
  constructor(wallet: string) {
    super(422, `Your wallet ${wallet} is not active.`);
  }
}

export class TonWalletNotOwnerOfPoolError extends BaseError {
  constructor(wallet: string, pool_address: string) {
    super(422, `Your wallet ${wallet} is not the owner of the pool ${pool_address}.`);
  }
}

export class TonWalletNotSenderOfVestingContractError extends BaseError {
  constructor(wallet: string, vesting_contract_address: string) {
    super(422, `Your wallet ${wallet} is not the sender of the vesting contract ${vesting_contract_address}.`);
  }
}
