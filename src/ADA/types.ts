import type { Responses } from '@blockfrost/blockfrost-js';
import type { TransactionInputsJSON } from '@emurgo/cardano-serialization-lib-nodejs';

export type Utxo = Responses['address_utxo_content'];

export type CardanoTx = {
  unsigned_tx_hash: string;
  unsigned_tx_serialized: string;
  inputs: TransactionInputsJSON;
};
