export type TonTx = {
  unsigned_tx_hash: string;
  unsigned_tx_serialized: string;
  from: string;
};

export type WalletInfo = {
  wallet: boolean;
  balance: string | 0;
  account_state: 'uninitialized' | 'active';
  last_transaction_id: {
    '@type': 'internal.transactionId';
    lt: string;
    hash: string;
  };
} & (
  | {
      wallet: false;
    }
  | {
      wallet: true;
      wallet_type: string;
      seqno: number;
      wallet_id: number;
    }
);
