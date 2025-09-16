import { BlockfrostServerError } from '@blockfrost/blockfrost-js';
import {
  Address,
  BigNum,
  type Certificates,
  FixedTransaction,
  LinearFee,
  RewardAddress,
  TransactionBuilder,
  TransactionBuilderConfigBuilder,
  TransactionHash,
  TransactionInput,
  TransactionOutput,
  Value,
  type Withdrawals,
} from '@emurgo/cardano-serialization-lib-nodejs';
import type BunBlockFrostApi from '@/ADA/client';
import { CARDANO_PARAMS, DEFAULT_NATIVE_FEES } from '@/ADA/constants';
import type { Utxo } from '@/ADA/types';
import { invariant } from '@/app/errors';

export default class AdaUtils {
  constructor(private readonly client: BunBlockFrostApi) {}

  /**
   * Get available rewards
   */
  public async getAvailableRewards(stake_address: string): Promise<number> {
    const account_info = await this.client.account(stake_address);
    return Math.max(Number(account_info.rewards_sum) - Number(account_info.withdrawals_sum), 0);
  }

  /**
   * Craft a transaction
   *
   * @throws {Error} if the latest block cannot be fetched
   */
  public async craftTx({
    input_address,
    utxos,
    output,
    certificates,
    withdrawals,
  }: {
    input_address: string;
    utxos: Utxo;
    output: TransactionOutput;
    certificates?: Certificates;
    withdrawals?: Withdrawals;
  }): Promise<FixedTransaction> {
    const fee_algo = LinearFee.new(
      BigNum.from_str(CARDANO_PARAMS.min_fee_a),
      BigNum.from_str(CARDANO_PARAMS.min_fee_b),
    );

    const tx_builder = TransactionBuilder.new(
      TransactionBuilderConfigBuilder.new()
        .fee_algo(fee_algo)
        .pool_deposit(BigNum.from_str(CARDANO_PARAMS.pool_deposit))
        .key_deposit(BigNum.from_str(CARDANO_PARAMS.key_deposit))
        .coins_per_utxo_byte(BigNum.from_str(CARDANO_PARAMS.coins_per_utxo_size))
        .max_value_size(CARDANO_PARAMS.max_val_size)
        .max_tx_size(CARDANO_PARAMS.max_tx_size)
        .build(),
    );

    if (certificates) tx_builder.set_certs(certificates);

    if (withdrawals) tx_builder.set_withdrawals(withdrawals);

    // Inputs
    const lovelace_utxos = utxos.filter((u) => u.amount.every((a) => a.unit === 'lovelace'));

    for (const utxo of lovelace_utxos) {
      const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;
      if (!amount) continue;

      const input_value = Value.new(BigNum.from_str(amount.toString()));

      const input = TransactionInput.new(
        TransactionHash.from_bytes(new Uint8Array(Buffer.from(utxo.tx_hash, 'hex'))),
        utxo.output_index,
      );
      tx_builder.add_regular_input(Address.from_bech32(input_address), input, input_value);
    }

    tx_builder.add_output(output);

    const latest_block = await this.client.blocksLatest();
    const current_slot = latest_block.slot;
    invariant(current_slot, 'Failed to fetch slot number');

    // Current slot + 2h
    const ttl = current_slot + 7200;
    tx_builder.set_ttl(ttl);
    tx_builder.set_fee(BigNum.from_str(DEFAULT_NATIVE_FEES.toString()));

    const tx = tx_builder.build_tx();
    return FixedTransaction.from_bytes(tx.to_bytes());
  }

  /**
   * Get UTXOs of a wallet
   *
   * @throws {Error} if the address has no UTXOs
   */
  public async getUtxos(wallet_address: string): Promise<Utxo> {
    try {
      return await this.client.addressesUtxos(wallet_address);
    } catch (err) {
      if (err instanceof BlockfrostServerError && err.status_code === 404) {
        throw new Error(`You should send ADA to ${wallet_address} to have enough funds to send a transaction`);
      }
      throw err;
    }
  }

  /**
   * Get stake key hash
   */
  public getStakeKeyHash(stake_key: string): Uint8Array | undefined {
    const rewardAddress = RewardAddress.from_address(Address.from_bech32(stake_key));
    const paymentCred = rewardAddress?.payment_cred();
    const hash = paymentCred?.to_keyhash();

    return hash?.to_bytes();
  }

  /**
   * Get the balance of a wallet
   */
  public getWalletBalance(utxos: Utxo) {
    let wallet_balance = 0;

    for (const utxo of utxos) {
      if (utxo.amount.length === 1 && utxo.amount[0].unit === 'lovelace') {
        wallet_balance += Number(utxo.amount[0].quantity);
      }
    }

    return wallet_balance;
  }

  /**
   * Prepare output (destination addresses and amounts) for a transaction
   */
  public prepareTxOutput({
    lovelace_value,
    to_address,
  }: {
    lovelace_value: string;
    to_address: string;
  }): TransactionOutput {
    return TransactionOutput.new(Address.from_bech32(to_address), Value.new(BigNum.from_str(lovelace_value)));
  }
}
