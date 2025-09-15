import { HttpBackend } from '@taquito/http-utils';
import { localForger } from '@taquito/local-forging';
import type { OperationContents } from '@taquito/rpc';
import { Context, type ForgeParams, OpKind, TezosToolkit } from '@taquito/taquito';
import { b58cdecode, b58cencode, buf2hex, hex2buf, mergebuf, prefix } from '@taquito/utils';
import sodium from 'libsodium-wrappers';
import { CouldNotBroadcastTx, CouldNotCraftTx, CouldNotPrepareTx } from '@/app/errors';
import { XtzAccountNotRevealedError, XtzCounterUndefinedError, XtzWalletNotDelegatedToBakerError } from '@/XTZ/errors';
import type { TezosTx } from '@/XTZ/types';

const FEE = '1300';
const GAS_LIMIT = '10100';
const STORAGE_LIMIT = '0';

export default class XtzService {
  private readonly client;
  private readonly context;
  private readonly backend;

  constructor() {
    this.client = new TezosToolkit(process.env.XTZ_RPC_URL as string);
    this.context = new Context(process.env.XTZ_RPC_URL as string);
    this.backend = new HttpBackend();
  }

  /**
   * Crafts a stake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftStakeTx({
    wallet,
    amount_mutez,
  }: {
    wallet: string;
    amount_mutez: string;
  }): Promise<TezosTx & { baker_address: string | null }> {
    try {
      const baker_address = await this.client.rpc.getDelegate(wallet);
      if (!baker_address) {
        throw new XtzWalletNotDelegatedToBakerError(wallet);
      }

      await this.checkAccount(wallet);

      const operation: OperationContents = {
        kind: OpKind.TRANSACTION,
        source: wallet,
        destination: wallet,
        amount: amount_mutez,
        fee: FEE,
        counter: await this.getCounter(wallet),
        gas_limit: GAS_LIMIT,
        storage_limit: STORAGE_LIMIT,
        parameters: {
          entrypoint: 'stake',
          value: {
            prim: 'Unit',
          },
        },
      };
      const tx = await this.buildTx(operation);
      return { ...tx, baker_address };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Crafts an unstake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftUnstakeTx({ wallet, amount_mutez }: { wallet: string; amount_mutez: string }): Promise<TezosTx> {
    try {
      await this.checkAccount(wallet);

      const operation: OperationContents = {
        kind: OpKind.TRANSACTION,
        source: wallet,
        destination: wallet,
        amount: amount_mutez,
        fee: FEE,
        counter: await this.getCounter(wallet),
        gas_limit: GAS_LIMIT,
        storage_limit: STORAGE_LIMIT,
        parameters: {
          entrypoint: 'unstake',
          value: {
            prim: 'Unit',
          },
        },
      };
      return await this.buildTx(operation);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Crafts a finalize unstake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftFinalizeUnstakeTx({ wallet }: { wallet: string }): Promise<TezosTx> {
    try {
      await this.checkAccount(wallet);

      const operation: OperationContents = {
        kind: OpKind.TRANSACTION,
        source: wallet,
        destination: wallet,
        amount: '0',
        fee: FEE,
        counter: await this.getCounter(wallet),
        gas_limit: GAS_LIMIT,
        storage_limit: STORAGE_LIMIT,
        parameters: {
          entrypoint: 'finalize_unstake',
          value: {
            prim: 'Unit',
          },
        },
      };
      return await this.buildTx(operation);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Crafts a delegate transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftDelegateTx({ wallet, baker_address }: { wallet: string; baker_address: string }): Promise<TezosTx> {
    try {
      await this.checkAccount(wallet);

      const operation: OperationContents = {
        kind: OpKind.DELEGATION,
        source: wallet,
        fee: FEE,
        counter: await this.getCounter(wallet),
        gas_limit: GAS_LIMIT,
        storage_limit: STORAGE_LIMIT,
        delegate: baker_address,
      };
      return await this.buildTx(operation);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft an undelegate transaction
   */
  public async craftUndelegateTx(wallet: string): Promise<TezosTx> {
    try {
      await this.checkAccount(wallet);

      const operation: OperationContents = {
        kind: OpKind.DELEGATION,
        source: wallet,
        fee: FEE,
        counter: await this.getCounter(wallet),
        gas_limit: GAS_LIMIT,
        storage_limit: STORAGE_LIMIT,
      };
      return await this.buildTx(operation);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Prepare an unsigned transaction for broadcast by adding a signature to it
   *
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx({
    unsigned_tx_serialized,
    signature,
  }: {
    unsigned_tx_serialized: string;
    signature: string;
  }): Promise<{ signed_tx_serialized: string }> {
    try {
      const prefix_sig = b58cencode(signature, prefix.edsig);
      const sig_decoded = b58cdecode(prefix_sig, prefix.edsig);
      const sig_to_inject = buf2hex(new Uint8Array(Buffer.from(sig_decoded)));
      const signed_tx_serialized = unsigned_tx_serialized + sig_to_inject;

      return { signed_tx_serialized };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Broadcast a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx(tx_serialized: string): Promise<{ tx_hash: string }> {
    try {
      const tx_hash = await this.client.rpc.injectOperation(tx_serialized);

      return { tx_hash };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }

  /**
   * Get the counter for a wallet and increment it
   */
  private async getCounter(wallet: string): Promise<string> {
    const counter = (await this.client.rpc.getContract(wallet)).counter;
    if (!counter) throw new XtzCounterUndefinedError(wallet);
    const reveal_counter = Number.parseInt(counter, 10) + 1;
    return reveal_counter.toString();
  }

  /**
   * Check if the account is revealed
   *
   * @throws {XtzAccountNotRevealedError} if the account is not revealed
   */
  private async checkAccount(wallet: string): Promise<void> {
    const isAccountRevealed = await this.context.readProvider.isAccountRevealed(wallet, 'head');
    if (!isAccountRevealed) {
      throw new XtzAccountNotRevealedError(wallet);
    }
  }

  /**
   * Build a tezos transaction
   */
  private async buildTx(operation: OperationContents): Promise<TezosTx> {
    const block_hash = (await this.client.rpc.getBlockHeader()).hash;

    const unsigned_tx: ForgeParams = {
      branch: block_hash,
      contents: [operation],
    };

    const unsigned_tx_serialized = await localForger.forge(unsigned_tx);
    const buffer = mergebuf(new Uint8Array([3]), hex2buf(unsigned_tx_serialized));
    const unsigned_tx_hash = buf2hex(new Uint8Array(Buffer.from(sodium.crypto_generichash(32, buffer))));

    return { unsigned_tx_hash, unsigned_tx_serialized, unsigned_tx };
  }
}
