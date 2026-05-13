import { ApiPromise, HttpProvider } from '@polkadot/api';
import type { ApiTypes, SubmittableExtrinsic } from '@polkadot/api/types';
import type { GenericSignerPayload } from '@polkadot/types';
import type { ISubmittableResult, SignerPayloadJSON } from '@polkadot/types/types';
import { REGISTRIES, type SubstrateToken } from '@/Substrate/constants';
import type { PolkadotTx } from '@/Substrate/types';

export default class SubstrateUtils {
  constructor(private token: SubstrateToken) {}
  public get client() {
    return ApiPromise.create({ provider: new HttpProvider(REGISTRIES[this.token].rpcUrl) });
  }

  /**
   * Deserialize a transaction
   */
  public deserializeTx(tx_serialized: string): SignerPayloadJSON {
    return JSON.parse(Buffer.from(tx_serialized, 'hex').toString()) as SignerPayloadJSON;
  }

  /**
   * Return the deserialized payload of a transaction.
   */
  public async deserializeTxPayload(tx: GenericSignerPayload): Promise<SignerPayloadJSON> {
    return tx.toPayload();
  }

  /**
   * Get the necessary information to craft a transaction
   */
  public async txInfo(account: string): Promise<Record<string, unknown>> {
    const client = await this.client;

    const nonce = (await client.rpc.system.accountNextIndex(account)).toNumber();
    const block = await client.rpc.chain.getBlock();
    const blockNumber = block.block.header.number;
    const blockHash = await client.rpc.chain.getBlockHash(blockNumber.toNumber());

    const txInfo: Record<string, unknown> = {
      address: account,
      blockHash: blockHash.toHex(),
      genesisHash: client.genesisHash.toHex(),
      nonce,
      tip: 0,
      era: client.registry.createType('ExtrinsicEra', {
        current: blockNumber,
        period: 64,
      }),
      runtimeVersion: client.runtimeVersion,
      version: client.extrinsicVersion,
    };
    return txInfo;
  }

  /**
   * Return true if the reward destination is an account
   */
  public isRewardDestinationAnAccount(reward_destination: string) {
    return (
      reward_destination !== 'Controller' &&
      reward_destination !== 'None' &&
      reward_destination !== 'Staked' &&
      reward_destination !== 'Stash'
    );
  }

  /**
   * Serialize an unsigned transaction
   */
  public serializeTx(unsigned: SignerPayloadJSON): string {
    return Buffer.from(JSON.stringify(unsigned)).toString('hex');
  }

  /**
   * Craft an unsigned transaction
   */
  public async craftTx(
    call: SubmittableExtrinsic<ApiTypes, ISubmittableResult>,
    txInfo: Record<string, unknown>,
  ): Promise<PolkadotTx> {
    const signer_payload = (await this.client).registry.createType('SignerPayload', {
      method: call.method.toHex(),
      ...txInfo,
    });

    const tx_payload = await this.deserializeTxPayload(signer_payload);
    const tx_serialized = this.serializeTx(tx_payload);
    return {
      unsigned_tx_payload: signer_payload.toRaw().data,
      unsigned_tx_serialized: tx_serialized,
      unsigned_tx: signer_payload.toHuman(),
    };
  }
}
