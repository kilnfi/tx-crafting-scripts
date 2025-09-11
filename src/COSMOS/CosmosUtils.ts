import { createHash } from 'node:crypto';
import { encodeSecp256k1Pubkey, type StdFee } from '@cosmjs/amino';
import { fromBech32, fromHex, toBech32 } from '@cosmjs/encoding';
import {
  type EncodeObject,
  encodePubkey,
  makeAuthInfoBytes,
  makeSignBytes,
  makeSignDoc,
  Registry,
  type TxBodyEncodeObject,
} from '@cosmjs/proto-signing';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { bech32 } from 'bech32';
import { MsgGrant, MsgRevoke } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { MsgWithdrawDelegatorReward } from 'cosmjs-types/cosmos/distribution/v1beta1/tx';
import { StakeAuthorization } from 'cosmjs-types/cosmos/staking/v1beta1/authz';
import { MsgBeginRedelegate, MsgDelegate, MsgUndelegate } from 'cosmjs-types/cosmos/staking/v1beta1/tx';
import { MsgTransfer } from 'cosmjs-types/ibc/applications/transfer/v1/tx';
import { CouldNotFindValidatorAddress } from '@/app/errors';
import CustomStargateClient, { type ClientOptions } from '@/COSMOS/CustomStargateClient';
import { MsgDepositForBurn } from '@/COSMOS/cctp/tx';
import { ADDRESS_PREFIX_MAP, GAS_MAPPING } from '@/COSMOS/constants';
import type { BaseCosmosTx, Token } from '@/COSMOS/types';

export default class CosmosUtils {
  public readonly registry;

  constructor(
    public readonly token: Token,
    public readonly client_options: ClientOptions,
  ) {
    this.registry = new Registry();
    this.registry.register('/cosmos.staking.v1beta1.MsgDelegate', MsgDelegate);
    this.registry.register('/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward', MsgWithdrawDelegatorReward);
    this.registry.register('/cosmos.staking.v1beta1.MsgUndelegate', MsgUndelegate);
    this.registry.register('/cosmos.staking.v1beta1.MsgBeginRedelegate', MsgBeginRedelegate);
    this.registry.register('/cosmos.authz.v1beta1.MsgGrant', MsgGrant);
    this.registry.register('/cosmos.authz.v1beta1.MsgRevoke', MsgRevoke);
    this.registry.register('/cosmos.staking.v1beta1.StakeAuthorization', StakeAuthorization);
    this.registry.register('/circle.cctp.v1.MsgDepositForBurn', MsgDepositForBurn);
    this.registry.register('/ibc.applications.transfer.v1.MsgTransfer', MsgTransfer);
    this.registry.register('/cosmos.bank.v1beta1.MsgSend', MsgSend);
  }

  public get client() {
    return CustomStargateClient.customConnect(this.client_options);
  }

  /**
   * Compress a public key
   */
  public compressPublicKey(pubkey: string): string {
    const pub_key_buffer: Uint8Array = new Uint8Array(Buffer.from(pubkey, 'hex'));
    if (pub_key_buffer.length !== 65) return pubkey;
    const x = pub_key_buffer.slice(1, 33);
    const y = pub_key_buffer.slice(33);
    // We will add 0x02 if the last bit isn't set, otherwise we will add 0x03
    const prefix = y[y.length - 1] & 1 ? '03' : '02';
    // Concatenate the prefix and the x value to get the compressed key
    const compressed_key = Buffer.concat([new Uint8Array(Buffer.from(prefix, 'hex')), x]);
    return compressed_key.toString('hex');
  }

  public pubkeyToSecp256k1Address(
    pubkey: string,
    opts?: {
      prefix?: string;
    },
  ): string {
    const compressed_pubkey = this.compressPublicKey(pubkey);

    const sha256 = createHash('sha256')
      .update(Uint8Array.from(Buffer.from(compressed_pubkey, 'hex')))
      .digest();

    const raw_address = createHash('ripemd160').update(new Uint8Array(sha256)).digest();
    const address_prefix = opts?.prefix ?? ADDRESS_PREFIX_MAP[this.token];

    return bech32.encode(address_prefix, bech32.toWords(raw_address));
  }

  /**
   * Convert the validator address to the account address
   * @example
   * ```
   * validator_address = "cosmosvaloper1uxlf7mvr8nep3gm7udf2u9remms2jyjqvwdul2";
   * account_address =  "cosmos1uxlf7mvr8nep3gm7udf2u9remms2jyjqf6efne"
   * ```
   */
  public validatorAddressToAccountAddress(validator_address: string): string {
    const validator = fromBech32(validator_address);
    const accountAdd = fromHex(Buffer.from(validator.data).toString('hex'));
    return toBech32(ADDRESS_PREFIX_MAP[this.token], accountAdd);
  }

  public async simulateTx({
    messages,
    pubkey,
    address,
    memo = '',
  }: {
    messages: EncodeObject[];
    address: string;
    pubkey: string;
    memo?: string;
  }): Promise<{ gas_limit: number; fee: StdFee }> {
    // estimate the gas limit
    // recommended is 1.4 but with 2 it is always safer
    // ref: https://github.com/cosmos/cosmjs/pull/931/files
    const multiplier = 2;
    const encoded_messages = messages.map((msg) => this.registry.encodeAsAny(msg));
    const encoded_pubkey = encodeSecp256k1Pubkey(Uint8Array.from(Buffer.from(pubkey, 'hex')));
    const estimated_gas = await (await this.client).simulate(encoded_pubkey, address, encoded_messages, memo);
    const gas_limit = estimated_gas * multiplier;
    const fee = calculateFee(gas_limit * multiplier, GasPrice.fromString(GAS_MAPPING[this.token]));

    return { gas_limit, fee };
  }

  /**
   * Check if the given validator address exists, if not throw a 422 error
   */
  public async ensureValidatorExists(validator_address: string): Promise<void> {
    try {
      await (await this.client).getValidator(validator_address);
    } catch (err) {
      throw new CouldNotFindValidatorAddress(err);
    }
  }

  /**
   * Craft a transaction
   */
  public async craftTx({
    pubkey,
    address,
    messages,
  }: {
    pubkey: string;
    address: string;
    messages: EncodeObject[];
  }): Promise<BaseCosmosTx> {
    const compressed_pubkey = this.compressPublicKey(pubkey);
    const tx_body_encode_object: TxBodyEncodeObject = {
      typeUrl: '/cosmos.tx.v1beta1.TxBody',
      value: { messages, memo: '' },
    };
    const tx_body_bytes = this.registry.encode(tx_body_encode_object);

    const { fee, gas_limit } = await this.simulateTx({ messages, address, pubkey: compressed_pubkey });
    const { accountNumber, sequence } = await (await this.client).getSequence(address);
    const chain_id = await (await this.client).getChainId();
    const pubkey_encoded = encodePubkey(encodeSecp256k1Pubkey(Uint8Array.from(Buffer.from(compressed_pubkey, 'hex'))));
    const auth_info_bytes = makeAuthInfoBytes(
      [{ pubkey: pubkey_encoded, sequence }],
      fee.amount,
      gas_limit,
      fee.granter,
      fee.payer,
    );
    const sign_doc = makeSignDoc(tx_body_bytes, auth_info_bytes, chain_id, accountNumber);
    const signed_bytes = makeSignBytes(sign_doc);
    const unsigned_tx_hash = createHash('sha256').update(signed_bytes).digest('hex');

    return {
      unsigned_tx_hash,
      fee,
      tx_body: Buffer.from(tx_body_bytes).toString('hex'),
      tx_auth_info: Buffer.from(auth_info_bytes).toString('hex'),
      unsigned_tx_serialized: Buffer.from(signed_bytes).toString('hex'),
      chain_id,
      account_number: accountNumber,
    };
  }
}
