import type { Message } from '@solana/web3.js';

export type SolanaTx = {
  unsigned_tx_hash: string;
  unsigned_tx_serialized: string;
  unsigned_tx: Message;
};
