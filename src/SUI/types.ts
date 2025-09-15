export type SuiTx = {
  unsigned_tx_serialized: string;
  unsigned_tx_hash: string;
  unsigned_tx: Record<string, unknown>;
};
