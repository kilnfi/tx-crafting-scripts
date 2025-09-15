import type { DryRunTransactionBlockResponse, SuiClient } from '@mysten/sui/client';
import { messageWithIntent } from '@mysten/sui/cryptography';
import type { Transaction } from '@mysten/sui/transactions';
import { toBase64, toHex } from '@mysten/sui/utils';
import { blake2b } from '@noble/hashes/blake2';
import { prefix0x } from '@/app/utils';
import { STAKED_SUI_TYPE_ID } from '@/SUI/constants';
import type { SuiTx } from '@/SUI/types';

type SerializedTransactionReturn<simulate extends boolean> = simulate extends true
  ? { tx: SuiTx; simulation: DryRunTransactionBlockResponse }
  : { tx: SuiTx };

export default class SuiUtils {
  constructor(private readonly client: SuiClient) {}

  public async serializeTransaction<simulate extends boolean>(tx: Transaction, options?: { simulate?: simulate }) {
    const unsignedTxBytes = await tx.build({ client: this.client });

    const intentMsg = messageWithIntent('TransactionData', unsignedTxBytes);
    const digest = blake2b(intentMsg, { dkLen: 32 });
    const contentHex = toHex(digest);

    const serializedTx = {
      unsigned_tx_serialized: toBase64(unsignedTxBytes),
      unsigned_tx_hash: prefix0x(contentHex),
      unsigned_tx: tx.getData(),
    };

    if (options?.simulate) {
      const simulation = await this.client.dryRunTransactionBlock({
        transactionBlock: unsignedTxBytes,
      });
      return { tx: serializedTx, simulation } as unknown as SerializedTransactionReturn<simulate>;
    }

    return { tx: serializedTx } as unknown as SerializedTransactionReturn<simulate>;
  }

  public async isValidStakeId(stake_id: string): Promise<boolean> {
    const response = await this.client.getObject({
      id: stake_id,
      options: {
        showType: true,
      },
    });

    return response.data?.type === STAKED_SUI_TYPE_ID;
  }

  public async getStakeBalance(stake_id: string): Promise<bigint> {
    const response = await this.client.getObject({
      id: stake_id,
      options: {
        showContent: true,
      },
    });

    const principal =
      response.data?.content?.dataType === 'moveObject' && 'principal' in response.data.content.fields
        ? String(response.data.content.fields.principal)
        : '0';
    const balance = BigInt(principal);
    return balance;
  }
}
