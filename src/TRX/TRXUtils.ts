import { utils } from 'tronweb';

interface TxPb {
  serializeBinary(): Uint8Array;
  getRawData(): TxRawPb;
  toObject(): object;
  setRawData(raw: TxRawPb): void;
  addSignature(signature: Buffer): void;
}

interface TxRawPb {
  serializeBinary(): Uint8Array;
  getExpiration(): number;
  setExpiration(expiration: number): void;
}
export default class TrxUtils {
  public serializedToPb(tx_serialized: string): TxPb {
    // @ts-expect-error
    const txData = globalThis.proto.Transaction.raw.deserializeBinary(Buffer.from(tx_serialized, 'hex')) as TxRawPb;
    // @ts-expect-error
    const tx = new globalThis.proto.Transaction() as TxPb;
    tx.setRawData(txData);
    return tx;
  }

  private pbToSerialized(pbTx: TxPb) {
    return Buffer.from(pbTx.getRawData().serializeBinary()).toString('hex');
  }

  public signedPbToSerialized(pbTx: TxPb) {
    return Buffer.from(pbTx.serializeBinary()).toString('hex');
  }

  private delayExpiration(pbTx: TxPb) {
    const rawData = pbTx.getRawData();
    rawData.setExpiration(rawData.getExpiration() + 1000 * 60 * 60 * 1); // 1 hour
    pbTx.setRawData(rawData);
    return pbTx;
  }

  public craftTx(raw_data_serialized: string) {
    const pbTx = this.serializedToPb(raw_data_serialized);
    const pbTxDelayed = this.delayExpiration(pbTx);

    const unsigned_tx_id = utils.transaction.txPbToTxID(pbTxDelayed).substring(2); // remove 0x prefix
    const unsigned_tx_serialized = this.pbToSerialized(pbTxDelayed);

    return { unsigned_tx_id, unsigned_tx_serialized };
  }
}
