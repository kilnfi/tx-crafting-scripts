import { ServerError } from '@/app/errors';

export class TonPoolNotActiveError extends ServerError {
  constructor(pool_address: string) {
    super(422, `Pool ${pool_address} is not active.`);
  }
}

export class TonWalletNotOwnerOfVestingContractError extends ServerError {
  constructor(wallet: string, vesting_contract_address: string) {
    super(422, `Your wallet ${wallet} is not the owner of the vesting contract ${vesting_contract_address}.`);
  }
}

export class TonVestingContractNotOwnerOfPoolError extends ServerError {
  constructor(vesting_contract_address: string, pool_address: string) {
    super(422, `Vesting contract ${vesting_contract_address} is not the owner the pool ${pool_address}.`);
  }
}

export class TonWalletNotActiveError extends ServerError {
  constructor(wallet: string) {
    super(422, `Your wallet ${wallet} is not active.`);
  }
}

export class TonWalletNotOwnerOfPoolError extends ServerError {
  constructor(wallet: string, pool_address: string) {
    super(422, `Your wallet ${wallet} is not the owner of the pool ${pool_address}.`);
  }
}

export class TonWalletNotSenderOfVestingContractError extends ServerError {
  constructor(wallet: string, vesting_contract_address: string) {
    super(422, `Your wallet ${wallet} is not the sender of the vesting contract ${vesting_contract_address}.`);
  }
}
