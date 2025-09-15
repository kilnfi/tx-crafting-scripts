import type { Pubkey } from '@cosmjs/amino';
import { ModuleAccount } from 'cosmjs-types/cosmos/auth/v1beta1/auth';
import type { Any } from 'cosmjs-types/google/protobuf/any';
import { invariant } from '@/errors/errors';
import CosmosService from '@/COSMOS/CosmosService';

const zetaAccountParse = (account: Any) => {
  const baseAccount = ModuleAccount.decode(account.value).baseAccount;
  invariant(baseAccount, 'Could not find base account');

  return {
    accountNumber: Number(baseAccount.accountNumber),
    address: baseAccount.address,
    pubkey: (baseAccount.pubKey ?? null) as Pubkey | null,
    sequence: Number(baseAccount.sequence),
  };
};

export class ZetaService extends CosmosService<'zeta'> {
  constructor() {
    super('zeta', {
      endpoint: process.env.ZETA_RPC_URL as string,
      accountParser: zetaAccountParse,
    });
  }
}
