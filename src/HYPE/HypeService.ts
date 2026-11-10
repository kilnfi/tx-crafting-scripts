import {
  concat,
  formatUnits,
  hashDomain,
  hashStruct,
  hexToNumber,
  keccak256,
  pad,
  recoverAddress,
  serializeSignature,
  size,
} from 'viem';
import { CouldNotBroadcastTx, CouldNotCraftTx, CouldNotPrepareTx, TxRejectedByNetwork } from '@/app/errors';
import {
  EIP712_DOMAIN_TYPE,
  HYPE_ACTION_TYPES,
  HYPE_API_URLS,
  HYPE_EIP712_DOMAIN_NAME,
  HYPE_EIP712_DOMAIN_VERSION,
  HYPE_EIP712_VERIFYING_CONTRACT,
  HYPE_SIGNATURE_CHAIN_IDS,
  HYPE_SYSTEM_ADDRESS,
} from '@/HYPE/constants';
import { HypeInvalidAmountError, HypeInvalidTxError, HypeSignerMismatchError } from '@/HYPE/errors';
import type {
  HypeAction,
  HypeCraftOptions,
  HypeDecodedTx,
  HypeNetwork,
  HyperliquidChain,
  HypeSendAssetAction,
  HypeSignature,
  HypeSignedTx,
  HypeTx,
  HypeTypedData,
} from '@/HYPE/types';

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type HypeActionBody = DistributiveOmit<HypeAction, 'signatureChainId' | 'hyperliquidChain' | 'nonce'>;

// Nonces must be unique per signer: keep them strictly increasing within the process, even in the same ms
let lastNonce = 0;
export const nextHypeNonce = (): number => {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return lastNonce;
};

const hyperliquidChain = (network: HypeNetwork): HyperliquidChain => (network === 'mainnet' ? 'Mainnet' : 'Testnet');

// uint64 on chain, but a JSON number in the action: 2^53 (~90M HYPE) is the practical bound
const toWei = (amount_wei: string): number => {
  const wei = Number(amount_wei);
  if (!/^\d+$/.test(amount_wei) || !Number.isSafeInteger(wei) || wei <= 0) {
    throw new HypeInvalidAmountError(amount_wei);
  }
  return wei;
};

// some signers drop a leading zero byte: pad r/s back to the 32 bytes the exchange endpoint expects
const toWord = (hex: `0x${string}`, name: string): `0x${string}` => {
  if (size(hex) > 32) {
    throw new HypeInvalidTxError(`signature ${name} must be at most 32 bytes`);
  }
  return pad(hex, { size: 32 });
};

const isAddress = (s: unknown): s is `0x${string}` => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

// strings only: String() would let numbers or arrays through a pattern, then hash them differently
const matches = (pattern: RegExp, value: unknown): value is string => typeof value === 'string' && pattern.test(value);

// v as 0/1 (recovery id) or 27/28, r/s padded to 32 bytes: the shape the exchange endpoint expects
const normalizeSignature = (signature: Partial<HypeSignature>): HypeSignature => {
  const hex = /^0x[0-9a-fA-F]+$/;
  if (!matches(hex, signature.r) || !matches(hex, signature.s)) {
    throw new HypeInvalidTxError('signature r and s must be 0x-prefixed hex');
  }
  const { v } = signature;
  if (typeof v !== 'number' || ![0, 1, 27, 28].includes(v)) {
    throw new HypeInvalidTxError(`signature v must be 0, 1, 27 or 28, got ${signature.v}`);
  }
  return {
    r: toWord(signature.r as `0x${string}`, 'r'),
    s: toWord(signature.s as `0x${string}`, 's'),
    v: v < 27 ? v + 27 : v,
  };
};

/** EIP-712 payload of an action: what the signer signs and Hyperliquid recovers the signer from */
const typedDataOf = (action: HypeAction): HypeTypedData => {
  const { primaryType, fields } = HYPE_ACTION_TYPES[action.type];
  const message: HypeTypedData['message'] = {};
  for (const f of fields) {
    message[f.name] = action[f.name as keyof HypeAction];
  }
  return {
    domain: {
      name: HYPE_EIP712_DOMAIN_NAME,
      version: HYPE_EIP712_DOMAIN_VERSION,
      chainId: hexToNumber(action.signatureChainId),
      verifyingContract: HYPE_EIP712_VERIFYING_CONTRACT,
    },
    types: { EIP712Domain: [...EIP712_DOMAIN_TYPE], [primaryType]: [...fields] },
    primaryType,
    message,
  };
};

/**
 * EIP-712 digest of an action's typed data, what the signer signs. Built from hashDomain/hashStruct rather than
 * hashTypedData: recent viem versions refuse struct names with a `:` such as `HyperliquidTransaction:CDeposit`.
 */
const digestOf = ({ domain, types, primaryType, message }: HypeTypedData): `0x${string}` =>
  keccak256(concat(['0x1901', hashDomain({ domain, types }), hashStruct({ data: message, primaryType, types })]));

/**
 * HYPE native staking on HyperCore: user-signed EIP-712 actions posted to the Hyperliquid exchange endpoint.
 * ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
 */
export default class HypeService {
  private spotToken?: Promise<string>;

  constructor(private readonly network: HypeNetwork = 'mainnet') {}

  /**
   * Craft a transfer to HyperEVM (sendAsset to `HYPE_SYSTEM_ADDRESS`): spot balance -> the signer's own HyperEVM
   * address, e.g. after a withdraw
   *
   * @throws {CouldNotCraftTx} if the HYPE token id could not be fetched
   */
  public async craftTransferToEvmTx({
    amount_wei,
    ...opts
  }: { amount_wei: string } & HypeCraftOptions): Promise<HypeTx> {
    const amount = formatUnits(BigInt(toWei(amount_wei)), 8);
    return this.craft(
      {
        type: 'sendAsset',
        destination: HYPE_SYSTEM_ADDRESS,
        sourceDex: 'spot',
        destinationDex: 'spot',
        token: await this.getSpotToken(),
        amount,
        fromSubAccount: '',
      },
      opts,
    );
  }

  /** Craft a deposit (cDeposit): spot balance -> staking balance */
  public craftDepositTx({ amount_wei, ...opts }: { amount_wei: string } & HypeCraftOptions): HypeTx {
    return this.craft({ type: 'cDeposit', wei: toWei(amount_wei) }, opts);
  }

  /** Craft a stake (tokenDelegate): staking balance -> validator, locked for 1 day */
  public craftStakeTx({
    validator_address,
    amount_wei,
    ...opts
  }: { validator_address: string; amount_wei: string } & HypeCraftOptions): HypeTx {
    return this.craft(
      {
        type: 'tokenDelegate',
        validator: this.validator(validator_address),
        wei: toWei(amount_wei),
        isUndelegate: false,
      },
      opts,
    );
  }

  /** Craft an unstake (tokenDelegate with isUndelegate): validator -> staking balance */
  public craftUnstakeTx({
    validator_address,
    amount_wei,
    ...opts
  }: { validator_address: string; amount_wei: string } & HypeCraftOptions): HypeTx {
    return this.craft(
      {
        type: 'tokenDelegate',
        validator: this.validator(validator_address),
        wei: toWei(amount_wei),
        isUndelegate: true,
      },
      opts,
    );
  }

  /** Craft a withdraw (cWithdraw): staking balance -> spot balance, after the 7-day unstaking queue */
  public craftWithdrawTx({ amount_wei, ...opts }: { amount_wei: string } & HypeCraftOptions): HypeTx {
    return this.craft({ type: 'cWithdraw', wei: toWei(amount_wei) }, opts);
  }

  /**
   * Decode an unsigned or signed transaction: the action and its amount in HYPE, the typed data and digest it is
   * signed over, and for a signed one the address its signature recovers to.
   *
   * @throws {HypeInvalidTxError} if the payload is not one of our actions or its signature does not recover
   */
  public async decodeTx(tx_serialized: string): Promise<HypeDecodedTx> {
    const parsed = this.parseJson(tx_serialized);
    const { action, nonce } = this.parseAction(parsed);
    const { wallet, signature } = parsed as { wallet?: unknown; signature?: Partial<HypeSignature> };
    const typed_data = typedDataOf(action);

    const decoded: HypeDecodedTx = {
      action,
      nonce,
      amount: action.type === 'sendAsset' ? action.amount : formatUnits(BigInt(action.wei), 8),
      typed_data,
      unsigned_tx_hash: digestOf(typed_data),
    };
    if (isAddress(wallet)) {
      decoded.wallet = wallet.toLowerCase() as `0x${string}`;
    }
    // a signature that is present but malformed is an error, not an unsigned transaction
    if (signature !== undefined) {
      if (!signature || typeof signature !== 'object') {
        throw new HypeInvalidTxError('signature must be an object with r, s and v');
      }
      decoded.signature = normalizeSignature(signature);
      decoded.signer = await this.recoverSigner(action, decoded.signature);
    }
    return decoded;
  }

  /**
   * Attach an ECDSA signature of `unsigned_tx_hash` (the EIP-712 digest of `typed_data`) to an unsigned action.
   * `v` is accepted as 0/1 (recovery id) or 27/28.
   *
   * @throws {HypeSignerMismatchError} if the signature does not recover to the wallet the action was crafted for
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx({
    unsigned_tx_serialized,
    signature,
  }: {
    unsigned_tx_serialized: string;
    signature: HypeSignature;
  }): Promise<{ signed_tx_serialized: string }> {
    try {
      const { action, nonce, wallet } = this.parseUnsignedTx(unsigned_tx_serialized);
      const sig = normalizeSignature(signature);

      // Hyperliquid acts for whoever signed: refuse a signature from another key than the crafted wallet's
      const signer = await this.recoverSigner(action, sig);
      if (signer !== wallet) {
        throw new HypeSignerMismatchError(wallet, signer);
      }

      const signed: HypeSignedTx = { action, nonce, signature: sig };
      return { signed_tx_serialized: JSON.stringify(signed) };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Post a signed action to the exchange endpoint, as returned by `prepareTx`. The payload is relayed as is:
   * Hyperliquid checks the action, its network and its signature. User-signed actions have no transaction hash:
   * the endpoint either accepts the action or refuses it.
   *
   * @throws {TxRejectedByNetwork} if Hyperliquid refused the action (bad nonce, insufficient balance, ...)
   * @throws {CouldNotBroadcastTx} if the endpoint could not be reached or answered an error status
   */
  public async broadcastTx(tx_serialized: string): Promise<{ status: 'ok' }> {
    const { action, nonce, signature } = this.parseJson(tx_serialized) as Partial<HypeSignedTx>;
    if (!action || typeof action !== 'object' || nonce === undefined || !signature || typeof signature !== 'object') {
      throw new HypeInvalidTxError('tx_serialized must carry an action, its nonce and a signature');
    }

    let result: { status: 'ok' | 'err'; response: unknown };
    try {
      const res = await fetch(`${HYPE_API_URLS[this.network]}/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, nonce, signature }),
      });
      if (!res.ok) {
        throw new Error(`Hyperliquid exchange endpoint returned HTTP ${res.status}: ${await res.text()}`);
      }
      result = (await res.json()) as typeof result;
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }

    if (result.status !== 'ok') {
      throw new TxRejectedByNetwork(new Error(String(result.response)));
    }
    return { status: 'ok' };
  }

  /** Lowercased address the signature of `action` recovers to, the account Hyperliquid acts for */
  private async recoverSigner(action: HypeAction, sig: HypeSignature): Promise<`0x${string}`> {
    try {
      const signer = await recoverAddress({
        hash: digestOf(typedDataOf(action)),
        signature: serializeSignature({ r: sig.r, s: sig.s, v: BigInt(sig.v) }),
      });
      return signer.toLowerCase() as `0x${string}`;
    } catch {
      throw new HypeInvalidTxError('the signature does not recover to an address');
    }
  }

  private craft(body: HypeActionBody, opts: HypeCraftOptions): HypeTx {
    const wallet = this.address(opts.wallet, 'wallet');
    try {
      const nonce = opts.nonce ?? nextHypeNonce();
      const action = {
        ...body,
        signatureChainId: opts.signature_chain_id ?? HYPE_SIGNATURE_CHAIN_IDS[this.network],
        hyperliquidChain: hyperliquidChain(this.network),
        nonce,
      } as HypeAction;
      const typed_data = typedDataOf(action);

      const unsigned_tx = { action, nonce, wallet };
      return {
        unsigned_tx_serialized: JSON.stringify(unsigned_tx),
        unsigned_tx_hash: digestOf(typed_data),
        unsigned_tx,
        typed_data,
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  private validator(address: string): `0x${string}` {
    return this.address(address, 'validator');
  }

  private address(address: string, what: string): `0x${string}` {
    if (!isAddress(address)) {
      throw new HypeInvalidTxError(`invalid ${what} address ${address}`);
    }
    return address.toLowerCase() as `0x${string}`;
  }

  /** `HYPE:{tokenId}` from spotMeta, fetched once per service: the id never changes on a network */
  private getSpotToken(): Promise<string> {
    this.spotToken ??= (async () => {
      try {
        const res = await fetch(`${HYPE_API_URLS[this.network]}/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'spotMeta' }),
        });
        if (!res.ok) {
          throw new Error(`Hyperliquid info endpoint returned HTTP ${res.status}: ${await res.text()}`);
        }
        const meta = (await res.json()) as { tokens?: { name: string; tokenId: string }[] };
        const hype = meta.tokens?.find((t) => t.name === 'HYPE');
        if (!hype) {
          throw new Error('HYPE not found in spotMeta');
        }
        return `HYPE:${hype.tokenId}`;
      } catch (err) {
        this.spotToken = undefined;
        throw new CouldNotCraftTx(err);
      }
    })();
    return this.spotToken;
  }

  private parseUnsignedTx(serialized: string): { action: HypeAction; nonce: number; wallet: `0x${string}` } {
    const parsed = this.parseJson(serialized);
    const { wallet } = parsed as { wallet?: unknown };
    if (!isAddress(wallet)) {
      throw new HypeInvalidTxError('unsigned_tx_serialized needs the wallet the action was crafted for');
    }
    return { ...this.parseAction(parsed), wallet: wallet.toLowerCase() as `0x${string}` };
  }

  private parseJson(serialized: string): object {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new HypeInvalidTxError('the serialized transaction is not JSON');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new HypeInvalidTxError('the serialized transaction must be a JSON object');
    }
    return parsed;
  }

  // the action is re-hashed by Hyperliquid from these fields: refuse anything that is not one of ours
  private parseAction(parsed: object): { action: HypeAction; nonce: number } {
    const { action, nonce } = parsed as { action?: Partial<HypeAction>; nonce?: unknown };
    // own keys only: `in` would also accept inherited names such as `constructor` or `toString`
    if (
      !action ||
      typeof action !== 'object' ||
      typeof action.type !== 'string' ||
      !Object.keys(HYPE_ACTION_TYPES).includes(action.type)
    ) {
      throw new HypeInvalidTxError('unknown action type');
    }
    // a uint64 in the signed message: a fraction or a negative number cannot be hashed
    if (typeof nonce !== 'number' || !Number.isSafeInteger(nonce) || nonce < 0 || action.nonce !== nonce) {
      throw new HypeInvalidTxError('nonce must be a non-negative integer equal to action.nonce');
    }
    if (action.type === 'sendAsset') {
      const send = action as Partial<HypeSendAssetAction>;
      if (
        send.destination !== HYPE_SYSTEM_ADDRESS ||
        send.sourceDex !== 'spot' ||
        send.destinationDex !== 'spot' ||
        !matches(/^HYPE:0x[0-9a-fA-F]+$/, send.token) ||
        !matches(/^\d+(\.\d+)?$/, send.amount) ||
        send.fromSubAccount !== ''
      ) {
        throw new HypeInvalidTxError('sendAsset is only a transfer of HYPE spot to HyperEVM, with a decimal amount');
      }
    } else {
      const { wei } = action as { wei?: unknown };
      if (typeof wei !== 'number' || !Number.isSafeInteger(wei) || wei <= 0) {
        throw new HypeInvalidTxError('action.wei must be a positive integer');
      }
    }
    if (action.hyperliquidChain !== 'Mainnet' && action.hyperliquidChain !== 'Testnet') {
      throw new HypeInvalidTxError('action.hyperliquidChain must be Mainnet or Testnet');
    }
    if (!matches(/^0x[0-9a-fA-F]{1,13}$/, action.signatureChainId)) {
      throw new HypeInvalidTxError('action.signatureChainId must be a hex chain id');
    }
    if (action.type === 'tokenDelegate' && (!isAddress(action.validator) || typeof action.isUndelegate !== 'boolean')) {
      throw new HypeInvalidTxError('tokenDelegate needs a validator address and isUndelegate');
    }
    return { action: action as HypeAction, nonce };
  }
}
