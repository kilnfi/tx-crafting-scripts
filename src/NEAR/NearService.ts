import { type ConnectConfig, connect, type Near, transactions, utils } from 'near-api-js';
import { type FinalExecutionOutcome, FinalExecutionStatusBasic } from 'near-api-js/lib/providers';
import { PublicKey } from 'near-api-js/lib/utils';
import { sha256 } from 'viem';
import {
  CouldNotBroadcastTx,
  CouldNotCraftTx,
  CouldNotDecodeTx,
  CouldNotGetTxStatus,
  CouldNotPrepareTx,
} from '@/app/errors';
import { NearCouldNotFindWalletAccessKeyError } from '@/NEAR/errors';

// Max gas fee to use (300 Tgas)
const MAX_GAS_AMOUNT = BigInt(300000000000000);

export default class NearService {
  private async getArchivalConnection(): Promise<Near> {
    const archivalRpc = 'https://archival-rpc.mainnet.fastnear.com';

    const connectionConfig: ConnectConfig = {
      networkId: 'mainnet',
      nodeUrl: archivalRpc,
    };

    return await connect(connectionConfig);
  }

  private async getStandardConnection(): Promise<Near> {
    const officialRpc = 'https://rpc.mainnet.fastnear.com';

    const connectionConfig: ConnectConfig = {
      networkId: 'mainnet',
      nodeUrl: officialRpc,
    };

    return await connect(connectionConfig);
  }

  private getConnection(): Promise<Near> {
    return this.getStandardConnection();
  }

  /**
   * Craft a stake transaction
   */
  public async craftStakeTx({
    wallet,
    pool_id,
    amount_yocto,
  }: {
    wallet: string;
    pool_id: string;
    amount_yocto: string;
  }) {
    try {
      const amount = BigInt(amount_yocto);
      const actions = [transactions.functionCall('deposit_and_stake', {}, MAX_GAS_AMOUNT, amount)];
      return this.buildTx(wallet, pool_id, actions);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft an unstake transaction
   */
  public async craftUnstakeTx({
    wallet,
    pool_id,
    amount_yocto,
  }: {
    wallet: string;
    pool_id: string;
    amount_yocto: string | null;
  }) {
    try {
      let params = {};
      if (amount_yocto) {
        params = {
          amount: amount_yocto,
        };
      }
      const amount = BigInt(0);
      const method = amount_yocto ? 'unstake' : 'unstake_all';
      const actions = [transactions.functionCall(method, params, MAX_GAS_AMOUNT, amount)];
      return this.buildTx(wallet, pool_id, actions);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a withdraw transaction
   */
  public async craftWithdrawTx({
    wallet,
    pool_id,
    amount_yocto,
  }: {
    wallet: string;
    pool_id: string;
    amount_yocto: string | null;
  }) {
    try {
      let params = {};
      if (amount_yocto) {
        params = {
          amount: amount_yocto,
        };
      }
      const amount = BigInt(0);
      const method = amount_yocto ? 'withdraw' : 'withdraw_all';
      const actions = [transactions.functionCall(method, params, MAX_GAS_AMOUNT, amount)];
      return this.buildTx(wallet, pool_id, actions);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Prepare a transaction for broadcast
   *
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx({ unsigned_tx_serialized, signature }: { unsigned_tx_serialized: string; signature: string }) {
    try {
      const tx = this.decodeTx(unsigned_tx_serialized);
      const signed_tx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: 0,
          data: Uint8Array.from(Buffer.from(signature, 'hex')),
        }),
      });
      const signed_tx_serialized_array = utils.serialize.serialize(transactions.SCHEMA.SignedTransaction, signed_tx);
      const signed_tx_serialized = Buffer.from(signed_tx_serialized_array).toString('hex');
      return {
        signed_tx_serialized,
      };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Broadcast a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcast
   */
  public async broadcastTx({ signed_tx_serialized }: { signed_tx_serialized: string }) {
    try {
      const connection = await this.getConnection();
      const signed_tx = transactions.SignedTransaction.decode(Buffer.from(signed_tx_serialized, 'hex'));
      const res = await connection.connection.provider.sendTransaction(signed_tx);
      return {
        tx_hash: res.transaction.hash,
      };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }

  /**
   * Decode a transaction
   *
   * @throws {CouldNotDecodeTx} if the transaction could not be decoded
   */
  public decodeTx(tx_serialized: string): transactions.Transaction {
    try {
      return transactions.Transaction.decode(Buffer.from(tx_serialized, 'hex'));
    } catch (err) {
      throw new CouldNotDecodeTx(err);
    }
  }

  /**
   * Build a transaction
   *
   * @throws {NearCouldNotFindWalletAccessKeyError} if the wallet access key could not be found
   */
  private async buildTx(wallet: string, pool_id: string, actions: transactions.Action[]) {
    const connection = await this.getConnection();
    const account = await connection.account(wallet);
    const access_keys = await account.getAccessKeys();
    const full_access_key = access_keys.find((key) => key.access_key.permission === 'FullAccess');
    if (!full_access_key) {
      throw new NearCouldNotFindWalletAccessKeyError(wallet);
    }
    const wallet_pubkey = PublicKey.from(full_access_key.public_key);
    const nonce = BigInt(1) + full_access_key.access_key.nonce;

    const access_key = await connection.connection.provider.query(
      `access_key/${wallet}/${wallet_pubkey.toString()}`,
      '',
    );
    const block_hash = new Uint8Array(utils.serialize.base_decode(access_key.block_hash));
    const tx = transactions.createTransaction(wallet, wallet_pubkey, pool_id, nonce, actions, block_hash);
    const unsigned_tx_serialized_array = utils.serialize.serialize(transactions.SCHEMA.Transaction, tx);
    const unsigned_tx_serialized = Buffer.from(unsigned_tx_serialized_array).toString('hex');
    const unsigned_tx_hash = sha256(unsigned_tx_serialized_array).slice(2);
    return {
      unsigned_tx_serialized,
      unsigned_tx_hash,
      tx,
    };
  }

  /**
   * Get transaction status
   *
   * @throws {CouldNotGetTxStatus} if the transaction status could not be retrieved
   */
  public async txStatus(
    tx_hash: string,
    wallet: string,
  ): Promise<{ status: 'success' | 'error'; receipt: FinalExecutionOutcome }> {
    try {
      const connection = await this.getArchivalConnection();
      const receipt = await connection.connection.provider.txStatus(tx_hash, wallet, 'FINAL');

      const status =
        typeof receipt.status === 'object'
          ? 'Failure' in receipt.status
            ? 'error'
            : 'success'
          : receipt.status === FinalExecutionStatusBasic.Failure
            ? 'error'
            : 'success';

      return { status, receipt };
    } catch (err) {
      throw new CouldNotGetTxStatus(err);
    }
  }
}
