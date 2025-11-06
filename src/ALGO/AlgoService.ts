import { microAlgo } from '@algorandfoundation/algokit-utils';
import algosdk from 'algosdk';
import AlgoUtils from '@/ALGO/AlgoUtils';
import { ALGO_ABI_METHODS, ALGO_CONSTANTS, RETI_APP_ID } from '@/ALGO/constants';
import { AlgoMinimumEntryStakeError } from '@/ALGO/errors';
import { CouldNotBroadcastTx, CouldNotCraftTx, CouldNotPrepareTx } from '@/app/errors';

export default class AlgoService {
  private readonly utils: AlgoUtils;

  constructor() {
    this.utils = new AlgoUtils();
  }

  /**
   * Craft an add stake transaction
   */
  public async craftAddStakeTx({
    sender_address,
    validator_id,
    amount_microalgo,
  }: {
    sender_address: string;
    validator_id: string;
    amount_microalgo: string;
  }) {
    try {
      const validator_id_bigint = BigInt(validator_id);
      const amount_bigint = BigInt(amount_microalgo);

      const validatorConfig = await this.utils.getValidatorConfig(validator_id_bigint, sender_address);
      const minEntryStake = validatorConfig[13];

      // Use minEntryStake for simulation to avoid validation failure when checking staker status
      // If actual amount is below minimum, the simulation would throw before we can determine if user is a new staker
      const poolForStakerResult = await this.utils.findPoolForStaker(
        validator_id_bigint,
        sender_address,
        minEntryStake,
      );
      const isNewStakerToValidator = poolForStakerResult[1];

      if (isNewStakerToValidator && amount_bigint < minEntryStake) {
        throw new AlgoMinimumEntryStakeError(amount_microalgo, minEntryStake.toString());
      }

      // Simulate to calculate required fees
      const simulateResult = await this.utils.simulateAddStake(validator_id_bigint, sender_address, amount_bigint);
      const appBudgetAdded = simulateResult.simulateResponse.txnGroups[0].appBudgetAdded || 0;
      const extraFee = this.utils.calculateExtraFee(appBudgetAdded, 2);

      // Set default validity window and get suggested params
      this.utils.setDefaultValidityWindow(ALGO_CONSTANTS.DEFAULT_VALIDITY_WINDOW);
      const suggestedParams = await this.utils.getSuggestedParams();
      const signer = algosdk.makeEmptyTransactionSigner();

      // Get ABI methods
      const gasMethod = this.utils.getAbiMethod(ALGO_ABI_METHODS.GAS);
      const addStakeMethod = this.utils.getAbiMethod(ALGO_ABI_METHODS.ADD_STAKE);

      // Create payment transaction
      const algorandClient = this.utils.getClient();
      const paymentTx = await algorandClient.createTransaction.payment({
        sender: sender_address,
        receiver: ALGO_CONSTANTS.RETI_APP_ADDRESS,
        amount: microAlgo(Number(amount_bigint)),
      });

      const atc = new algosdk.AtomicTransactionComposer();

      atc.addMethodCall({
        appID: RETI_APP_ID,
        method: gasMethod,
        methodArgs: [],
        sender: sender_address,
        signer,
        suggestedParams,
        note: new Uint8Array(Buffer.from('1')),
      });

      atc.addMethodCall({
        appID: RETI_APP_ID,
        method: gasMethod,
        methodArgs: [],
        sender: sender_address,
        suggestedParams,
        signer,
        note: new Uint8Array(Buffer.from('2')),
      });

      atc.addMethodCall({
        appID: RETI_APP_ID,
        method: addStakeMethod,
        methodArgs: [
          {
            txn: paymentTx,
            signer,
          },
          validator_id_bigint,
          0n,
        ],
        sender: sender_address,
        suggestedParams: {
          ...suggestedParams,
          fee: ALGO_CONSTANTS.BASE_FEE + extraFee,
          flatFee: true,
        },
        signer,
      });

      const populatedTxs = await this.utils.populateAndBuildAtc(atc);

      return {
        unsigned_txs_serialized: populatedTxs.map((tx) => Buffer.from(tx.bytesToSign()).toString('hex')),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a remove stake transaction
   */
  public async craftRemoveStakeTx({
    sender_address,
    validator_id,
    amount_microalgo,
  }: {
    sender_address: string;
    validator_id: string;
    amount_microalgo: string;
  }) {
    try {
      const validator_id_bigint = BigInt(validator_id);
      const amount_bigint = BigInt(amount_microalgo);

      // Simulate to calculate required fees
      const simulateResult = await this.utils.simulateRemoveStake(validator_id_bigint, sender_address, amount_bigint);
      const appBudgetAdded = simulateResult.simulateResponse.txnGroups[0].appBudgetAdded || 0;
      const extraFee = this.utils.calculateExtraFee(appBudgetAdded, 2);

      // Set default validity window and get suggested params
      this.utils.setDefaultValidityWindow(ALGO_CONSTANTS.DEFAULT_VALIDITY_WINDOW);
      const suggestedParams = await this.utils.getSuggestedParams();
      const signer = algosdk.makeEmptyTransactionSigner();

      // Get ABI methods
      const gasMethod = this.utils.getAbiMethod(ALGO_ABI_METHODS.GAS);
      const removeStakeMethod = this.utils.getAbiMethod(ALGO_ABI_METHODS.REMOVE_STAKE);

      const atc = new algosdk.AtomicTransactionComposer();

      atc.addMethodCall({
        appID: RETI_APP_ID,
        method: gasMethod,
        methodArgs: [],
        sender: sender_address,
        signer,
        suggestedParams,
        note: new Uint8Array(Buffer.from('1')),
      });

      atc.addMethodCall({
        appID: RETI_APP_ID,
        method: gasMethod,
        methodArgs: [],
        sender: sender_address,
        suggestedParams,
        signer,
        note: new Uint8Array(Buffer.from('2')),
      });

      atc.addMethodCall({
        appID: RETI_APP_ID,
        method: removeStakeMethod,
        methodArgs: [validator_id_bigint, 0n, amount_bigint],
        sender: sender_address,
        suggestedParams: {
          ...suggestedParams,
          fee: ALGO_CONSTANTS.BASE_FEE + extraFee,
          flatFee: true,
        },
        signer,
      });

      const populatedTxs = await this.utils.populateAndBuildAtc(atc);

      return {
        unsigned_txs_serialized: populatedTxs.map((tx) => Buffer.from(tx.bytesToSign()).toString('hex')),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Prepare a transaction by attaching signatures
   */
  public async prepareTx(
    signed_messages: { signature: string; unsigned_tx_serialized: string }[],
  ): Promise<{ signed_txs_serialized: string[] }> {
    try {
      const signed_txs: Uint8Array[] = [];

      for (let i = 0; i < signed_messages.length; i++) {
        const signedMessage = signed_messages[i];

        // Remove "TX" prefix (first 4 hex chars = 2 bytes "5458") to decode transaction
        const txBytesHex = signedMessage.unsigned_tx_serialized.substring(4);
        const txBytes = Buffer.from(txBytesHex, 'hex');
        const tx = algosdk.decodeUnsignedTransaction(txBytes);

        // Attach signature to transaction
        const signature = Uint8Array.from(Buffer.from(signedMessage.signature, 'hex'));
        const senderAddr = algosdk.encodeAddress(tx.sender.publicKey);
        const signedTx = tx.attachSignature(senderAddr, signature);
        signed_txs.push(signedTx);
      }

      return {
        signed_txs_serialized: signed_txs.map((stx) => Buffer.from(stx).toString('hex')),
      };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Broadcast a transaction
   */
  public async broadcastTx(signed_txs_serialized: string[]): Promise<{ tx_id: string }> {
    try {
      const signedTxs = signed_txs_serialized.map((stx) => new Uint8Array(Buffer.from(stx, 'hex')));

      const algorandClient = this.utils.getClient();
      const result = await algorandClient.client.algod.sendRawTransaction(signedTxs).do();

      return { tx_id: result.txid };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }
}
