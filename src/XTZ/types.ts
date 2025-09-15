import type { ForgeParams } from '@taquito/local-forging';

export type TezosTx = {
  unsigned_tx_hash: string;
  unsigned_tx_serialized: string;
  unsigned_tx: ForgeParams;
};
