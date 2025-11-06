import { AlgorandClient, microAlgo, populateAppCallResources } from '@algorandfoundation/algokit-utils';
import type algosdk from 'algosdk';
import { ALGO_ABI_METHODS, ALGO_CONSTANTS, RETI_APP_ID } from '@/ALGO/constants';
import { AlgoFindPoolError, AlgoGetStakerInfoError, AlgoValidatorConfigError } from '@/ALGO/errors';
import type { PoolForStakerResult, StakerInfo, ValidatorConfig } from '@/ALGO/types';

export default class AlgoUtils {
  private readonly algorandClient: AlgorandClient;

  constructor() {
    this.algorandClient = AlgorandClient.mainNet();
  }

  public async getValidatorConfig(validator_id: bigint, sender_address: string): Promise<ValidatorConfig> {
    try {
      const configComposer = this.algorandClient.newGroup().addAppCallMethodCall({
        sender: sender_address,
        appId: RETI_APP_ID,
        method: ALGO_ABI_METHODS.GET_VALIDATOR_CONFIG,
        args: [validator_id],
      });

      const configResult = await configComposer.simulate({
        skipSignatures: true,
        allowUnnamedResources: true,
      });

      const failureMessage = configResult.simulateResponse.txnGroups[0].failureMessage;
      if (failureMessage) {
        throw new AlgoValidatorConfigError(failureMessage);
      }

      const returnValue = configResult.returns?.[0]?.returnValue;
      if (!returnValue) {
        throw new AlgoValidatorConfigError('No validator config returned');
      }

      return returnValue as ValidatorConfig;
    } catch (error) {
      if (error instanceof AlgoValidatorConfigError) {
        throw error;
      }

      throw new AlgoValidatorConfigError(
        error instanceof Error ? error.message : 'Unknown error fetching validator config',
      );
    }
  }

  public async findPoolForStaker(
    validator_id: bigint,
    sender_address: string,
    stake_amount: bigint,
  ): Promise<PoolForStakerResult> {
    try {
      const poolComposer = this.algorandClient
        .newGroup()
        .addAppCallMethodCall({
          sender: sender_address,
          appId: RETI_APP_ID,
          method: ALGO_ABI_METHODS.GAS,
          args: [],
        })
        .addAppCallMethodCall({
          sender: sender_address,
          appId: RETI_APP_ID,
          method: ALGO_ABI_METHODS.FIND_POOL_FOR_STAKER,
          args: [validator_id, sender_address, stake_amount],
        });

      const poolResult = await poolComposer.simulate({
        skipSignatures: true,
        allowUnnamedResources: true,
      });

      const failureMessage = poolResult.simulateResponse.txnGroups[0].failureMessage;
      if (failureMessage) {
        throw new AlgoFindPoolError(failureMessage);
      }

      const returnValue = poolResult.returns?.[1]?.returnValue;
      if (!returnValue) {
        throw new AlgoFindPoolError('No pool result returned');
      }

      return returnValue as PoolForStakerResult;
    } catch (error) {
      if (error instanceof AlgoFindPoolError) {
        throw error;
      }

      throw new AlgoFindPoolError(error instanceof Error ? error.message : 'Unknown error finding pool for staker');
    }
  }

  public async getStakerInfo(poolAppId: bigint, staker_address: string): Promise<StakerInfo> {
    try {
      const stakerInfoComposer = this.algorandClient.newGroup().addAppCallMethodCall({
        sender: staker_address,
        appId: poolAppId,
        method: ALGO_ABI_METHODS.GET_STAKER_INFO,
        args: [staker_address],
        staticFee: microAlgo(10000),
      });

      const stakerInfoResult = await stakerInfoComposer.simulate({
        skipSignatures: true,
        allowUnnamedResources: true,
      });

      const failureMessage = stakerInfoResult.simulateResponse.txnGroups[0].failureMessage;
      if (failureMessage) {
        throw new AlgoGetStakerInfoError(failureMessage);
      }

      const returnValue = stakerInfoResult.returns?.[0]?.returnValue;
      if (!returnValue) {
        throw new AlgoGetStakerInfoError('No staker info returned');
      }

      return returnValue as StakerInfo;
    } catch (error) {
      if (error instanceof AlgoGetStakerInfoError) {
        throw error;
      }

      throw new AlgoGetStakerInfoError(error instanceof Error ? error.message : 'Unknown error fetching staker info');
    }
  }

  public calculateExtraFee(app_budget_added: number, num_gas_calls: number): number {
    const feeAmount =
      ALGO_CONSTANTS.FEE_PER_CHUNK *
        Math.floor((app_budget_added + ALGO_CONSTANTS.OPCODES_PER_CHUNK - 1) / ALGO_CONSTANTS.OPCODES_PER_CHUNK) -
      num_gas_calls * ALGO_CONSTANTS.GAS_CALL_FEE;

    return Math.max(feeAmount, 0);
  }

  public async populateAndBuildAtc(atc: algosdk.AtomicTransactionComposer): Promise<algosdk.Transaction[]> {
    const populatedAtc = await populateAppCallResources(atc, this.algorandClient.client.algod);

    return populatedAtc
      .clone()
      .buildGroup()
      .map((tx) => tx.txn);
  }

  public async getSuggestedParams(): Promise<algosdk.SuggestedParams> {
    return await this.algorandClient.client.algod.getTransactionParams().do();
  }

  public setDefaultValidityWindow(blocks: number): void {
    this.algorandClient.setDefaultValidityWindow(blocks);
  }

  public getClient(): AlgorandClient {
    return this.algorandClient;
  }

  public async simulateAddStake(validator_id: bigint, sender_address: string, stake_amount: bigint) {
    const paymentTxn = await this.algorandClient.createTransaction.payment({
      sender: sender_address,
      receiver: ALGO_CONSTANTS.RETI_APP_ADDRESS,
      amount: microAlgo(Number(stake_amount)),
    });

    const simulateComposer = this.algorandClient
      .newGroup()
      .addAppCallMethodCall({
        sender: sender_address,
        appId: RETI_APP_ID,
        method: ALGO_ABI_METHODS.GAS,
        args: [],
        note: '1',
      })
      .addAppCallMethodCall({
        sender: sender_address,
        appId: RETI_APP_ID,
        method: ALGO_ABI_METHODS.GAS,
        args: [],
        note: '2',
      })
      .addAppCallMethodCall({
        sender: sender_address,
        appId: RETI_APP_ID,
        method: ALGO_ABI_METHODS.ADD_STAKE,
        args: [paymentTxn, validator_id, 0n],
        staticFee: microAlgo(240000),
      });

    return await simulateComposer.simulate({
      skipSignatures: true,
      allowUnnamedResources: true,
    });
  }

  public async simulateRemoveStake(poolAppId: bigint, sender_address: string, unstake_amount: bigint) {
    const simulateComposer = this.algorandClient
      .newGroup()
      .addAppCallMethodCall({
        sender: sender_address,
        appId: poolAppId,
        method: ALGO_ABI_METHODS.GAS,
        args: [],
        note: '1',
      })
      .addAppCallMethodCall({
        sender: sender_address,
        appId: poolAppId,
        method: ALGO_ABI_METHODS.GAS,
        args: [],
        note: '2',
      })
      .addAppCallMethodCall({
        sender: sender_address,
        appId: poolAppId,
        method: ALGO_ABI_METHODS.REMOVE_STAKE,
        args: [sender_address, unstake_amount],
        staticFee: microAlgo(240000),
      });

    return await simulateComposer.simulate({
      skipSignatures: true,
      allowUnnamedResources: true,
    });
  }
}
