import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { toSerializedSignature } from '@mysten/sui/cryptography';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_SYSTEM_STATE_OBJECT_ID } from '@mysten/sui/utils';
import { CouldNotBroadcastTx, CouldNotCraftTx, CouldNotPrepareTx } from '@/app/errors';
import { remove0x } from '@/app/utils';
import { SUI_MIN_STAKE_IN_MIST, SUI_OPERATIONS } from '@/SUI/constants';
import { SuiInvalidSplitStakeAmountError, SuiInvalidStakeIdError } from '@/SUI/errors';
import SuiUtils from '@/SUI/SuiUtils';
import type { SuiTx } from '@/SUI/types';

export default class SuiService {
  private readonly client;
  private readonly utils;

  constructor() {
    this.client = new SuiClient({ url: getFullnodeUrl('mainnet') });
    this.utils = new SuiUtils(this.client);
  }

  /**
   * Craft stake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftStakeTx({
    amount_mist,
    validator_address,
    sender,
  }: {
    sender: string;
    validator_address: string;
    amount_mist: string;
  }): Promise<SuiTx & { stake_id: string }> {
    try {
      const tx = new Transaction();
      tx.setSender(sender);

      const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(amount_mist))]);

      tx.moveCall({
        target: SUI_OPERATIONS.request_add_stake,
        arguments: [tx.object(SUI_SYSTEM_STATE_OBJECT_ID), stakeCoin, tx.pure.address(validator_address)],
      });

      const { simulation, tx: serializedTx } = await this.utils.serializeTransaction(tx, { simulate: true });
      if (simulation.executionErrorSource) {
        throw new CouldNotCraftTx(simulation.executionErrorSource);
      }

      const created_object = simulation.objectChanges.find((change) => change.type === 'created');

      if (!created_object) {
        throw new CouldNotCraftTx('No created object found in simulation result');
      }

      const stake_id = created_object.objectId;

      return {
        ...serializedTx,
        stake_id,
      };
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft send transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */

  public async craftSendTx({
    amount_mist,
    to,
    sender,
  }: {
    amount_mist: string;
    to: string;
    sender: string;
  }): Promise<SuiTx> {
    try {
      const tx = new Transaction();
      tx.setSender(sender);

      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(amount_mist))]);
      tx.transferObjects([coin], tx.pure.address(to));

      const { tx: serializedTx } = await this.utils.serializeTransaction(tx);

      return serializedTx;
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft unstake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftUnstakeTx({ stake_id, sender }: { stake_id: string; sender: string }): Promise<SuiTx> {
    try {
      if (!(await this.utils.isValidStakeId(stake_id))) {
        throw new SuiInvalidStakeIdError(stake_id);
      }

      const tx = new Transaction();
      tx.setSender(sender);

      tx.moveCall({
        target: SUI_OPERATIONS.request_withdraw_stake,
        arguments: [tx.object(SUI_SYSTEM_STATE_OBJECT_ID), tx.object(stake_id)],
      });

      const { tx: serializedTx } = await this.utils.serializeTransaction(tx);

      return serializedTx;
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft transaction to split a staked position into two parts
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftSplitStakeTx({
    stake_id,
    amount_mist,
    sender,
  }: {
    stake_id: string;
    amount_mist: string;
    sender: string;
  }): Promise<SuiTx & { new_stake_id: string }> {
    try {
      if (!(await this.utils.isValidStakeId(stake_id))) {
        throw new SuiInvalidStakeIdError(stake_id);
      }

      const stakeBalance = await this.utils.getStakeBalance(stake_id);
      const requestedSplitAmount = BigInt(amount_mist);

      const splitStakeAmount = requestedSplitAmount;
      const originalStakeAmount = stakeBalance - requestedSplitAmount;

      if (splitStakeAmount <= SUI_MIN_STAKE_IN_MIST || originalStakeAmount <= SUI_MIN_STAKE_IN_MIST) {
        throw new SuiInvalidSplitStakeAmountError();
      }

      const tx = new Transaction();
      tx.setSender(sender);

      tx.moveCall({
        target: SUI_OPERATIONS.split_staked_sui,
        arguments: [tx.object(stake_id), tx.pure.u64(BigInt(amount_mist))],
      });

      const { simulation, tx: serializedTx } = await this.utils.serializeTransaction(tx, { simulate: true });

      if (simulation.executionErrorSource) {
        throw new CouldNotCraftTx(simulation.executionErrorSource);
      }

      const created_object = simulation.objectChanges.find((change) => change.type === 'created');

      if (!created_object) {
        throw new CouldNotCraftTx('No created object found in simulation result');
      }

      const newStakeId = created_object.objectId;

      return {
        ...serializedTx,
        new_stake_id: newStakeId,
      };
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Craft transaction to join two staked positions into one
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftJoinStakeTx({
    destination_stake_id,
    source_stake_id,
    sender,
  }: {
    destination_stake_id: string;
    source_stake_id: string;
    sender: string;
  }): Promise<SuiTx> {
    try {
      if (!(await this.utils.isValidStakeId(destination_stake_id))) {
        throw new SuiInvalidStakeIdError(destination_stake_id);
      }

      if (!(await this.utils.isValidStakeId(source_stake_id))) {
        throw new SuiInvalidStakeIdError(source_stake_id);
      }

      const tx = new Transaction();
      tx.setSender(sender);

      tx.moveCall({
        target: SUI_OPERATIONS.join_staked_sui,
        arguments: [tx.object(destination_stake_id), tx.object(source_stake_id)],
      });

      const { tx: serializedTx } = await this.utils.serializeTransaction(tx);

      return serializedTx;
    } catch (error) {
      throw new CouldNotCraftTx(error);
    }
  }

  /**
   * Broadcast a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx(tx_serialized: string, serialized_signature: string): Promise<{ digest: string }> {
    try {
      const result = await this.client.executeTransactionBlock({
        transactionBlock: tx_serialized,
        signature: serialized_signature,
        requestType: 'WaitForLocalExecution',
        options: {
          showEffects: true,
        },
      });

      const { digest } = await this.client.waitForTransaction({
        digest: result.digest,
      });

      return { digest };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }

  public async prepareTx(
    signature: string,
    pubkey: string,
    tx_serialized: string,
  ): Promise<{ serialized_signature: string; tx_serialized: string }> {
    try {
      const sigBytes = Buffer.from(remove0x(signature), 'hex');
      const pubkeyBytes = Buffer.from(remove0x(pubkey), 'hex');

      const suiSignature = toSerializedSignature({
        signature: sigBytes,
        signatureScheme: 'ED25519',
        publicKey: new Ed25519PublicKey(pubkeyBytes),
      });

      return {
        serialized_signature: suiSignature,
        tx_serialized,
      };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }
}
