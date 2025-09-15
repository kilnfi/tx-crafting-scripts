import { type Coin, coin, encodeSecp256k1Signature } from '@cosmjs/amino';
import { fromBase64 } from '@cosmjs/encoding';
import { type DecodedTxRaw, decodeTxRaw, type EncodeObject } from '@cosmjs/proto-signing';
import type {
  IndexedTx,
  MsgBeginRedelegateEncodeObject,
  MsgDelegateEncodeObject,
  MsgSendEncodeObject,
  MsgUndelegateEncodeObject,
  MsgWithdrawDelegatorRewardEncodeObject,
} from '@cosmjs/stargate';
import { MsgGrant, MsgRevoke } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { MsgWithdrawDelegatorReward } from 'cosmjs-types/cosmos/distribution/v1beta1/tx';
import { AuthorizationType, StakeAuthorization } from 'cosmjs-types/cosmos/staking/v1beta1/authz';
import { MsgBeginRedelegate, MsgDelegate, MsgUndelegate } from 'cosmjs-types/cosmos/staking/v1beta1/tx';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import {
  CouldNotBroadcastTx,
  CouldNotCraftTx,
  CouldNotDecodeTx,
  CouldNotFindTxStatus,
  CouldNotGetBalance,
  CouldNotGetTxStatus,
  CouldNotPrepareTx,
  InsufficientBalanceError,
} from '@/errors/errors';
import CosmosUtils from '@/COSMOS/CosmosUtils';
import CustomStargateClient, { type ClientOptions } from '@/COSMOS/CustomStargateClient';
import { TOKEN_UNIT_MAP } from '@/COSMOS/constants';
import {
  CosmosCannotRedelegateToSameValidatorError,
  CosmosPublicKeyNotDelegatedToSourceValidatorError,
  CosmosPublicKeyNotDelegatedToValidatorError,
} from '@/COSMOS/errors';
import type {
  CosmosRestakeRewardsOptions,
  CosmosRevokeRestakeRewardsOptions,
  CosmosStakingTx,
  CosmosTx,
  MsgGrantAllowanceEncodeObject,
  MsgRevokeAllowanceEncodeObject,
  Token,
  TokenToUnit,
} from '@/COSMOS/types';

export default class CosmosService<T extends Token> {
  protected readonly utils;
  protected readonly token_unit: TokenToUnit[T];

  constructor(
    public readonly token: T,
    protected readonly client_options: ClientOptions,
  ) {
    this.token_unit = TOKEN_UNIT_MAP[token] as TokenToUnit[T];
    this.utils = new CosmosUtils(token, client_options);
  }

  public get client() {
    return CustomStargateClient.customConnect(this.client_options);
  }

  /**
   * Decode a transaction
   *
   * @throws {CouldNotDecodeTx} if the transaction could not be decoded
   */
  public async decodeTx(tx_serialized: string): Promise<DecodedTxRaw> {
    try {
      return decodeTxRaw(Uint8Array.from(Buffer.from(tx_serialized, 'hex')));
    } catch (err) {
      throw new CouldNotDecodeTx(err);
    }
  }

  /**
   * Broadcast a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx(tx_serialized: string): Promise<{ tx_hash: string }> {
    try {
      const result = await (await this.client).broadcastTx(Uint8Array.from(Buffer.from(tx_serialized, 'hex')));
      return { tx_hash: result.transactionHash };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }

  /**
   * Get the status of a transaction
   *
   * @throws {CouldNotGetTxStatus} if the transaction could not be found
   */
  public async txStatus(tx_hash: string): Promise<{
    status: 'success' | 'error';
    receipt: IndexedTx | null;
  }> {
    try {
      const receipt = await (await this.client).getTx(tx_hash);
      if (!receipt) throw new CouldNotFindTxStatus();
      const status = receipt.code === 0 ? 'success' : 'error';
      return { status, receipt };
    } catch (err) {
      throw new CouldNotGetTxStatus(err);
    }
  }

  /**
   * Prepare a transaction
   *
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx({
    pubkey,
    signature,
    tx_body,
    tx_auth_info,
  }: {
    pubkey: string;
    tx_body: string;
    tx_auth_info: string;
    signature: string;
  }): Promise<{ signed_tx_serialized: string }> {
    try {
      const encoded_signature = encodeSecp256k1Signature(
        Uint8Array.from(Buffer.from(pubkey, 'hex')),
        Uint8Array.from(Buffer.from(signature, 'hex')),
      );

      const signed_tx = TxRaw.fromPartial({
        bodyBytes: Uint8Array.from(Buffer.from(tx_body, 'hex')),
        authInfoBytes: Uint8Array.from(Buffer.from(tx_auth_info, 'hex')),
        signatures: [fromBase64(encoded_signature.signature)],
      });

      const signed_tx_serialized = Buffer.from(TxRaw.encode(signed_tx).finish()).toString('hex');

      return { signed_tx_serialized };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Craft a transaction to withdraw rewards
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftWithdrawRewardsTx({
    pubkey,
    validator,
    opts,
  }: {
    pubkey: string;
    validator: string;
    opts?: { address?: string };
  }): Promise<CosmosTx> {
    try {
      const address = opts?.address ?? this.utils.pubkeyToSecp256k1Address(pubkey);

      // ensure the validator exists
      await this.utils.ensureValidatorExists(validator);

      const message: MsgWithdrawDelegatorRewardEncodeObject = {
        typeUrl: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
        value: MsgWithdrawDelegatorReward.fromPartial({
          delegatorAddress: address,
          validatorAddress: validator,
        }),
      };

      const tx = await this.utils.craftTx({
        pubkey,
        address,
        messages: [message],
      });

      return { ...tx, pubkey, message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a transaction to stake
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftStakeTx(args: {
    pubkey: string;
    validator: string;
    restake_rewards: boolean;
    amount: string;
    grantee_address: string | null;
    opts?: {
      address?: string;
    };
  }): Promise<CosmosStakingTx> {
    try {
      const { pubkey, validator, amount, grantee_address, restake_rewards, opts } = args;

      const address = opts?.address ?? this.utils.pubkeyToSecp256k1Address(pubkey);
      const amount_to_stake = coin(amount, this.token_unit);

      // check if the address has enough balance
      const balance = await this.getBalance({ address, denom: this.token_unit });
      if (BigInt(balance.amount) < BigInt(amount_to_stake.amount)) {
        throw new InsufficientBalanceError(address, balance.amount, amount_to_stake.amount);
      }

      // ensure the validator exists
      await this.utils.ensureValidatorExists(validator);

      const msg = MsgDelegate.fromPartial({
        delegatorAddress: address,
        validatorAddress: validator,
        amount: amount_to_stake,
      });

      const delegateMsg: MsgDelegateEncodeObject = {
        typeUrl: '/cosmos.staking.v1beta1.MsgDelegate',
        value: msg,
      };

      const messages: EncodeObject[] = [delegateMsg];
      if (restake_rewards && grantee_address) {
        messages.push(
          this.getRestakeRewardsMsg({
            address,
            validator_address: validator,
            grantee_address,
          }),
        );
      }

      const tx = await this.utils.craftTx({
        pubkey,
        address,
        messages,
      });

      return { ...tx, pubkey, messages };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a Redelegate transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftRedelegateTx(args: {
    pubkey: string;
    validator_source: string;
    validator_destination: string;
    amount: string | null;
    opts?: {
      address?: string;
    };
  }): Promise<CosmosTx> {
    try {
      const { pubkey, validator_destination, validator_source, amount, opts } = args;
      const address = opts?.address ?? this.utils.pubkeyToSecp256k1Address(pubkey);

      // ensure the validator_source is different from the validator_destination
      if (validator_source === validator_destination) {
        throw new CosmosCannotRedelegateToSameValidatorError(validator_source);
      }

      const amount_to_redelegate =
        amount === null
          ? await (await this.client).getDelegation(address, validator_source)
          : coin(amount, this.token_unit);

      if (!amount_to_redelegate) {
        throw new CosmosPublicKeyNotDelegatedToSourceValidatorError(pubkey, validator_source);
      }

      const message: MsgBeginRedelegateEncodeObject = {
        typeUrl: '/cosmos.staking.v1beta1.MsgBeginRedelegate',
        value: MsgBeginRedelegate.fromPartial({
          delegatorAddress: address,
          validatorSrcAddress: validator_source,
          validatorDstAddress: validator_destination,
          amount: amount_to_redelegate,
        }),
      };

      const tx = await this.utils.craftTx({
        pubkey,
        messages: [message],
        address,
      });

      return { ...tx, pubkey, message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft an Unstake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftUnstakeTx(args: {
    pubkey: string;
    validator: string;
    amount: string | null;
    opts?: {
      address?: string;
    };
  }): Promise<CosmosTx> {
    try {
      const { pubkey, validator, amount, opts } = args;
      const address = opts?.address ?? this.utils.pubkeyToSecp256k1Address(pubkey);

      // ensure the validator exists
      await this.utils.ensureValidatorExists(validator);

      const amount_to_undelegate =
        amount === null ? await (await this.client).getDelegation(address, validator) : coin(amount, this.token_unit);

      if (!amount_to_undelegate) {
        throw new CosmosPublicKeyNotDelegatedToValidatorError(pubkey, validator);
      }

      const message: MsgUndelegateEncodeObject = {
        typeUrl: '/cosmos.staking.v1beta1.MsgUndelegate',
        value: MsgUndelegate.fromPartial({
          delegatorAddress: address,
          validatorAddress: validator,
          amount: amount_to_undelegate,
        }),
      };

      const tx = await this.utils.craftTx({
        pubkey,
        address,
        messages: [message],
      });

      return { ...tx, pubkey, message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a restake rewards transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftRestakeRewardsTx({
    pubkey,
    validator_address,
    grantee_address,
    opts,
  }: CosmosRestakeRewardsOptions): Promise<CosmosTx> {
    try {
      const address = opts?.address ?? this.utils.pubkeyToSecp256k1Address(pubkey);
      const message = this.getRestakeRewardsMsg({
        address,
        validator_address,
        grantee_address,
      });

      const tx = await this.utils.craftTx({
        pubkey,
        address,
        messages: [message],
      });

      return { ...tx, pubkey, message: message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a Revoke Restake Rewards transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftRevokeRestakeRewardsTx({
    pubkey,
    grantee_address,
    opts,
  }: CosmosRevokeRestakeRewardsOptions): Promise<CosmosTx> {
    try {
      const address = opts?.address ?? this.utils.pubkeyToSecp256k1Address(pubkey);
      const message = this.getRevokeRestakeRewardsMsg({
        address,
        grantee_address,
      });

      const tx = await this.utils.craftTx({
        pubkey,
        address,
        messages: [message],
      });

      return { ...tx, pubkey, message: message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a send transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftSendTx(args: {
    pubkey: string;
    to: string;
    amount: string;
    opts?: {
      address?: string;
    };
  }): Promise<CosmosTx> {
    try {
      const { pubkey, amount, to, opts } = args;
      const address = opts?.address ?? this.utils.pubkeyToSecp256k1Address(pubkey);
      const amount_to_send = coin(amount, this.token_unit);

      // check if the address has enough balance
      const balance = await this.getBalance({ address, denom: this.token_unit });
      if (BigInt(balance.amount) < BigInt(amount_to_send.amount)) {
        throw new InsufficientBalanceError(address, balance.amount, amount_to_send.amount);
      }

      const msg = MsgSend.fromPartial({
        fromAddress: address,
        toAddress: to,
        amount: [amount_to_send],
      });

      const message: MsgSendEncodeObject = {
        typeUrl: '/cosmos.bank.v1beta1.MsgSend',
        value: msg,
      };

      const tx = await this.utils.craftTx({
        pubkey,
        address,
        messages: [message],
      });

      return { ...tx, pubkey, message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  protected getRestakeRewardsMsg({
    address,
    validator_address,
    grantee_address,
  }: {
    address: string;
    validator_address: string;
    grantee_address: string;
  }): MsgGrantAllowanceEncodeObject {
    const msg = MsgGrant.fromPartial({
      granter: address,
      grantee: grantee_address,
      grant: {
        // 1 year timestamp
        expiration: { seconds: BigInt(Math.floor(Date.now() / 1000) + 31556952) },
        authorization: {
          typeUrl: '/cosmos.staking.v1beta1.StakeAuthorization',
          value: Uint8Array.from(
            StakeAuthorization.encode(
              StakeAuthorization.fromPartial({
                allowList: { address: [validator_address] },
                maxTokens: undefined,
                authorizationType: AuthorizationType.AUTHORIZATION_TYPE_DELEGATE,
              }),
            ).finish(),
          ),
        },
      },
    });

    return {
      typeUrl: '/cosmos.authz.v1beta1.MsgGrant',
      value: msg,
    };
  }

  protected getRevokeRestakeRewardsMsg({
    address,
    grantee_address,
  }: {
    address: string;
    grantee_address: string;
  }): MsgRevokeAllowanceEncodeObject {
    const msg = MsgRevoke.fromPartial({
      granter: address,
      grantee: grantee_address,
      msgTypeUrl: '/cosmos.staking.v1beta1.MsgDelegate',
    });

    return {
      typeUrl: '/cosmos.authz.v1beta1.MsgRevoke',
      value: msg,
    };
  }

  /**
   * Get address balance
   *
   * @throws {CouldNotGetBalance} if the transaction could not be crafted
   */
  public async getBalance(args: { address: string; denom: string }): Promise<Coin> {
    try {
      const { address, denom } = args;
      return await (await this.client).getBalance(address, denom);
    } catch (err) {
      throw new CouldNotGetBalance(err);
    }
  }
}
