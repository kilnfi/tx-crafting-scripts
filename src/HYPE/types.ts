export type HypeNetwork = 'mainnet' | 'testnet';

export type HyperliquidChain = 'Mainnet' | 'Testnet';

type HypeActionHeader = {
  signatureChainId: `0x${string}`;
  hyperliquidChain: HyperliquidChain;
  nonce: number;
};

type HypeActionBase = HypeActionHeader & {
  /** amount in 10^-8 HYPE, a JSON number as the exchange endpoint expects */
  wei: number;
};

/** spot balance -> staking balance */
export type HypeCDepositAction = HypeActionBase & { type: 'cDeposit' };

/** staking balance -> spot balance, after the 7-day unstaking queue */
export type HypeCWithdrawAction = HypeActionBase & { type: 'cWithdraw' };

/** staking balance <-> validator */
export type HypeTokenDelegateAction = HypeActionBase & {
  type: 'tokenDelegate';
  validator: `0x${string}`;
  isUndelegate: boolean;
};

/** spot balance -> another HyperCore account's spot balance (the system address for HyperEVM) */
export type HypeSendAssetAction = HypeActionHeader & {
  type: 'sendAsset';
  destination: `0x${string}`;
  sourceDex: 'spot';
  destinationDex: 'spot';
  /** `HYPE:{tokenId}`, the id differs between networks */
  token: string;
  /** decimal amount in HYPE */
  amount: string;
  fromSubAccount: '';
};

export type HypeAction = HypeCDepositAction | HypeCWithdrawAction | HypeTokenDelegateAction | HypeSendAssetAction;

export type HypeTypedData = {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, string | number | boolean>;
};

/** Unsigned action: `unsigned_tx_serialized` is the JSON of `unsigned_tx`, `typed_data` the EIP-712 payload to sign */
export type HypeTx = {
  unsigned_tx_serialized: string;
  unsigned_tx_hash: `0x${string}`;
  /** `wallet` is never posted to Hyperliquid: it is the signer `prepareTx` checks the signature against */
  unsigned_tx: { action: HypeAction; nonce: number; wallet: `0x${string}` };
  typed_data: HypeTypedData;
};

export type HypeSignature = { r: `0x${string}`; s: `0x${string}`; v: number };

/** A decoded unsigned or signed transaction */
export type HypeDecodedTx = {
  action: HypeAction;
  nonce: number;
  /** decimal amount in HYPE moved by the action */
  amount: string;
  typed_data: HypeTypedData;
  /** EIP-712 digest of `typed_data`, what the signer signs */
  unsigned_tx_hash: `0x${string}`;
  /** unsigned transactions only: the wallet the action was crafted for */
  wallet?: `0x${string}`;
  /** signed transactions only: the signature and the address it recovers to, the account the action acts for */
  signature?: HypeSignature;
  signer?: `0x${string}`;
};

/** Signed action, as posted to the Hyperliquid exchange endpoint */
export type HypeSignedTx = { action: HypeAction; nonce: number; signature: HypeSignature };

export type HypeCraftOptions = {
  /** HyperCore account expected to sign the action */
  wallet: string;
  /** EIP-712 domain chainId; must match what the signer expects, defaults to the HyperEVM chain of the network */
  signature_chain_id?: `0x${string}`;
  /** must be unique per signer, defaults to the current timestamp in ms */
  nonce?: number;
};
