import type { StdFee } from '@cosmjs/amino';
import type { EncodeObject } from '@cosmjs/proto-signing';
import type { MsgGrant, MsgRevoke } from 'cosmjs-types/cosmos/authz/v1beta1/tx';

export type BaseCosmosTx = {
  unsigned_tx_hash: string;
  fee: StdFee;
  tx_body: string;
  tx_auth_info: string;
  unsigned_tx_serialized: string;
  chain_id: string;
  account_number: number;
};

export type CosmosTx = BaseCosmosTx & {
  pubkey: string;
  message: EncodeObject;
};

export type CosmosStakingTx = BaseCosmosTx & {
  pubkey: string;
  messages: EncodeObject[];
};

export interface MsgGrantAllowanceEncodeObject extends EncodeObject {
  readonly typeUrl: '/cosmos.authz.v1beta1.MsgGrant';
  readonly value: Partial<MsgGrant>;
}

export interface MsgRevokeAllowanceEncodeObject extends EncodeObject {
  readonly typeUrl: '/cosmos.authz.v1beta1.MsgRevoke';
  readonly value: Partial<MsgRevoke>;
}

export type CosmosRestakeRewardsOptions = {
  pubkey: string;
  validator_address: string;
  grantee_address: string;
  opts?: {
    address?: string;
  };
};

export type CosmosRevokeRestakeRewardsOptions = {
  pubkey: string;
  grantee_address: string;
  opts?: {
    address?: string;
  };
};

export type TokenToUnit = {
  atom: 'uatom';
  osmo: 'uosmo';
  dydx: 'adydx';
  tia: 'utia';
  zeta: 'azeta';
  noble: 'uusdc';
  fet: 'afet';
  inj: 'inj';
  kava: 'ukava';
  om: 'uom';
  cro: 'basecro';
  sei: 'usei';
};

export type Token = keyof TokenToUnit;

export type TokenUnit = TokenToUnit[Token];
