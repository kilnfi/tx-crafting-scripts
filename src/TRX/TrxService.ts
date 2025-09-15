import { TronWeb } from 'tronweb';
import type { Resource, TransactionInfo, VoteInfo } from 'tronweb/lib/esm/types';
import {
  CouldNotBroadcastTx,
  CouldNotCraftTx,
  CouldNotDecodeTx,
  CouldNotGetTxStatus,
  CouldNotPrepareTx,
} from '@/errors/errors';
import TrxUtils from '@/TRX/TRXUtils';

export default class TrxService {
  private readonly utils;
  private readonly tronWeb: TronWeb;

  constructor() {
    this.utils = new TrxUtils();
    this.tronWeb = new TronWeb({
      fullHost: process.env.TRON_RPC_URL as string,
    });
  }

  /**
   * Get the status of a transaction
   *
   * @throws {CouldNotGetTxStatus} if the transaction could not be found
   */
  public async txStatus(tx_hash: string): Promise<{ status: 'success' | 'error'; info: TransactionInfo }> {
    try {
      const info = await this.tronWeb.trx.getTransactionInfo(tx_hash);

      if (!info.id) {
        throw new Error(`Transaction with hash ${tx_hash} not found`);
      }

      const status = info.result === 'FAILED' ? 'error' : 'success';
      return { status, info };
    } catch (err) {
      throw new CouldNotGetTxStatus(err);
    }
  }

  /**
   * Decode a transaction
   *
   * @throws {CouldNotDecodeTx} if the transaction could not be decoded
   */
  public async decodeTx(tx_serialized: string): Promise<object> {
    try {
      const pbTx = this.utils.serializedToPb(tx_serialized);
      return pbTx.toObject();
    } catch (err) {
      throw new CouldNotDecodeTx(err);
    }
  }

  /**
   * Craft a stake transaction
   */
  public async craftStakeTx({
    owner_address,
    amount_sun,
    resource,
  }: {
    owner_address: string;
    amount_sun: string;
    resource: Resource;
  }): Promise<{ unsigned_tx_serialized: string }> {
    try {
      const tx = await this.tronWeb.transactionBuilder.freezeBalanceV2(Number(amount_sun), resource, owner_address);

      return this.utils.craftTx(tx.raw_data_hex);
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft an unstake transaction
   */
  public async craftUnstakeTx({
    owner_address,
    amount_sun,
    resource,
  }: {
    owner_address: string;
    amount_sun: string;
    resource: Resource;
  }) {
    try {
      const tx = await this.tronWeb.transactionBuilder.unfreezeBalanceV2(Number(amount_sun), resource, owner_address);

      return this.utils.craftTx(tx.raw_data_hex);
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft a cancel unstake transaction
   */
  public async craftCancelUnstakeTx({ owner_address }: { owner_address: string }) {
    try {
      const tx = await this.tronWeb.transactionBuilder.cancelUnfreezeBalanceV2(owner_address);

      return this.utils.craftTx(tx.raw_data_hex);
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft a withdrawUnStaked transaction
   */
  public async craftWithdrawUnstakedTx({ owner_address }: { owner_address: string }) {
    try {
      const tx = await this.tronWeb.transactionBuilder.withdrawExpireUnfreeze(owner_address);

      return this.utils.craftTx(tx.raw_data_hex);
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft a vote transaction
   */
  public async craftVoteTx({ owner_address, votes }: { owner_address: string; votes: VoteInfo }) {
    try {
      const tx = await this.tronWeb.transactionBuilder.vote(votes, owner_address);

      return this.utils.craftTx(tx.raw_data_hex);
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft a withdrawRewards transaction
   */
  public async craftWithdrawRewardsTx({ owner_address }: { owner_address: string }) {
    try {
      const tx = await this.tronWeb.transactionBuilder.withdrawBlockRewards(owner_address);

      return this.utils.craftTx(tx.raw_data_hex);
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Prepare a transaction for broadcasting
   */
  public async prepareTx({ unsigned_tx_serialized, signature }: { unsigned_tx_serialized: string; signature: string }) {
    try {
      const pbTx = this.utils.serializedToPb(unsigned_tx_serialized);
      pbTx.addSignature(Buffer.from(signature, 'hex'));

      return {
        signed_tx_serialized: this.utils.signedPbToSerialized(pbTx),
      };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Broadcasts a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx({ tx_serialized }: { tx_serialized: string }): Promise<{ tx_hash: string }> {
    try {
      const tx = await this.tronWeb.trx.sendHexTransaction(tx_serialized);

      if (!tx.result) throw new CouldNotBroadcastTx(tx.message);

      return { tx_hash: tx.txid };
    } catch (error) {
      throw new CouldNotBroadcastTx(error);
    }
  }
}
