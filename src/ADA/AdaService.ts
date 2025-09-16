import {
  Address,
  BigNum,
  Certificate,
  Certificates,
  Credential,
  DataCost,
  DRep,
  Ed25519KeyHash,
  Ed25519Signature,
  min_ada_for_output,
  PublicKey,
  RewardAddress,
  StakeAndVoteDelegation,
  StakeDeregistration,
  StakeRegistration,
  Transaction,
  TransactionWitnessSet,
  Vkey,
  Vkeywitness,
  Vkeywitnesses,
  Withdrawals,
} from '@emurgo/cardano-serialization-lib-nodejs';
import AdaUtils from '@/ADA/AdaUtils';
import BlockFrostApi from '@/ADA/client';
import { CARDANO_PARAMS, DEFAULT_NATIVE_FEES } from '@/ADA/constants';
import { AdaAddressDoesNotHaveStakeRightsError, AdaWithdrawalAmountExceedsAvailableRewardsError } from '@/ADA/errors';
import type { CardanoTx } from '@/ADA/types';
import { CouldNotCraftTx, CouldNotPrepareTx, InsufficientBalanceError, invariant } from '@/app/errors';

export default class AdaService {
  private readonly utils;
  private readonly client;

  constructor() {
    this.client = new BlockFrostApi({ projectId: process.env.ADA_BLOCKFROST_PROJECT_ID as string });
    this.utils = new AdaUtils(this.client);
  }

  /**
   * Broadcast a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx(tx_serialized: string): Promise<{ tx_hash: string }> {
    const tx = Transaction.from_hex(tx_serialized);
    const tx_hash = await this.client.txSubmit(tx.to_bytes());
    return { tx_hash };
  }

  public async craftStakeTx(
    wallet: string,
    pool_id: string,
  ): Promise<CardanoTx & { stake_address: string /* used to tag the stake in core-api */ }> {
    try {
      const utxos = await this.utils.getUtxos(wallet);
      const address = await this.client.addresses(wallet);
      if (!address.stake_address) throw new AdaAddressDoesNotHaveStakeRightsError(wallet);

      const stake_key_hash = this.utils.getStakeKeyHash(address.stake_address);
      invariant(stake_key_hash, 'Could not fetch stake key hash');

      const certificates = Certificates.new();
      const registrations = await this.client.accountsRegistrationsAll(address.stake_address);
      const last_registration = registrations.length > 0 ? registrations[registrations.length - 1] : undefined;
      const pool = await this.client.poolsById(pool_id);
      const poolKey_hash = Ed25519KeyHash.from_hex(pool.hex);

      const account_info = await this.client.account(address.stake_address);

      // Don't include deposit fee if stake is already active
      const deposit_fee = account_info.active ? 0 : Number(CARDANO_PARAMS.key_deposit);

      const wallet_balance = this.utils.getWalletBalance(utxos);
      const out_amount = (wallet_balance - DEFAULT_NATIVE_FEES - deposit_fee).toString();

      // Register stake key if not done already or if last registration was a deregister action
      if (!last_registration || last_registration.action === 'deregistered') {
        certificates.add(
          Certificate.new_stake_registration(
            StakeRegistration.new(Credential.from_keyhash(Ed25519KeyHash.from_bytes(stake_key_hash))),
          ),
        );
      }

      // Register stake and vote delegation (always abstain)
      certificates.add(
        Certificate.new_stake_and_vote_delegation(
          StakeAndVoteDelegation.new(
            Credential.from_keyhash(Ed25519KeyHash.from_bytes(stake_key_hash)),
            poolKey_hash,
            DRep.new_always_abstain(),
          ),
        ),
      );

      const output = this.utils.prepareTxOutput({ lovelace_value: out_amount, to_address: wallet });

      const data_cost = DataCost.new_coins_per_byte(BigNum.from_str(CARDANO_PARAMS.coins_per_utxo_size));
      const min_ada = min_ada_for_output(output, data_cost);

      if (output.amount().coin().less_than(min_ada)) {
        const min = Number(min_ada.to_js_value().toString()) + deposit_fee + DEFAULT_NATIVE_FEES;
        throw new InsufficientBalanceError(wallet, out_amount, min.toString());
      }

      const tx = await this.utils.craftTx({ input_address: wallet, utxos, output, certificates });

      return {
        unsigned_tx_hash: tx.transaction_hash().to_hex(),
        unsigned_tx_serialized: tx.to_hex(),
        inputs: tx.body().inputs().to_js_value(),
        stake_address: address.stake_address,
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a transaction to unstake
   *
   * @throws {AdaAddressDoesNotHaveStakeRightsError} if the address does not have stake rights
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftUnstakeTx(wallet: string): Promise<CardanoTx> {
    try {
      const utxos = await this.utils.getUtxos(wallet);
      const address = await this.client.addresses(wallet);
      if (!address.stake_address) throw new AdaAddressDoesNotHaveStakeRightsError(wallet);

      const stake_key_hash = this.utils.getStakeKeyHash(address.stake_address);
      invariant(stake_key_hash, 'Could not hash stake key');

      const withdrawals = Withdrawals.new();
      const reward_address = RewardAddress.from_address(Address.from_bech32(address.stake_address));
      invariant(reward_address, 'Could not retrieve rewards address');

      const available_rewards = await this.utils.getAvailableRewards(address.stake_address);
      withdrawals.insert(reward_address, BigNum.from_str(available_rewards.toString()));

      const wallet_balance = this.utils.getWalletBalance(utxos);
      const out_amount = (
        wallet_balance -
        DEFAULT_NATIVE_FEES +
        Number(CARDANO_PARAMS.key_deposit) +
        available_rewards
      ).toString();
      const output = this.utils.prepareTxOutput({ lovelace_value: out_amount, to_address: wallet });

      // Deregister certificate
      const certificates = Certificates.new();
      certificates.add(
        Certificate.new_stake_deregistration(
          StakeDeregistration.new(Credential.from_keyhash(Ed25519KeyHash.from_bytes(stake_key_hash))),
        ),
      );

      const tx = await this.utils.craftTx({ input_address: wallet, utxos, output, certificates, withdrawals });
      return {
        unsigned_tx_hash: tx.transaction_hash().to_hex(),
        unsigned_tx_serialized: tx.to_hex(),
        inputs: tx.body().inputs().to_js_value(),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a transaction to withdraw rewards
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftWithdrawRewardsTx(wallet: string, amount_lovelace: string | null): Promise<CardanoTx> {
    try {
      const utxos = await this.utils.getUtxos(wallet);
      const address = await this.client.addresses(wallet);
      if (!address.stake_address) throw new AdaAddressDoesNotHaveStakeRightsError(wallet);

      const withdrawals = Withdrawals.new();
      const reward_address = RewardAddress.from_address(Address.from_bech32(address.stake_address));
      invariant(reward_address, 'Could not retrieve rewards address');

      const available_rewards = await this.utils.getAvailableRewards(address.stake_address);
      if (amount_lovelace && BigInt(amount_lovelace) > BigInt(available_rewards)) {
        throw new AdaWithdrawalAmountExceedsAvailableRewardsError(amount_lovelace, available_rewards.toString());
      }

      const amountToWithdrawLovelace = amount_lovelace ? amount_lovelace : available_rewards.toString();
      withdrawals.insert(reward_address, BigNum.from_str(amountToWithdrawLovelace));

      const wallet_balance = this.utils.getWalletBalance(utxos);
      const out_amount = (wallet_balance - DEFAULT_NATIVE_FEES + Number(amountToWithdrawLovelace)).toString();
      const output = this.utils.prepareTxOutput({ lovelace_value: out_amount, to_address: wallet });

      const tx = await this.utils.craftTx({ input_address: wallet, utxos, output, withdrawals });
      return {
        unsigned_tx_hash: tx.transaction_hash().to_hex(),
        unsigned_tx_serialized: tx.to_hex(),
        inputs: tx.body().inputs().to_js_value(),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Prepare a transaction
   *
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx(
    unsigned_tx_serialized: string,
    signed_messages: { pubkey: string; signature: string }[],
  ): Promise<{ signed_tx_serialized: string }> {
    try {
      const witnesses = TransactionWitnessSet.new();
      const vkey_witnesses = Vkeywitnesses.new();

      for (const signed_message of signed_messages) {
        const pubKey = PublicKey.from_hex(signed_message.pubkey);
        const vKey = Vkey.new(pubKey);
        const signature = Ed25519Signature.from_hex(signed_message.signature);
        const vkey_witness = Vkeywitness.new(vKey, signature);
        vkey_witnesses.add(vkey_witness);
      }

      witnesses.set_vkeys(vkey_witnesses);
      const tx = Transaction.from_hex(unsigned_tx_serialized);
      const signed_tx = Transaction.new(tx.body(), witnesses);

      return { signed_tx_serialized: signed_tx.to_hex() };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }
}
