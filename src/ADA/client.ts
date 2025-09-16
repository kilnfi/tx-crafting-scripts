import type { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import type {
  AdditionalEndpointOptions,
  AllMethodOptions,
  PaginationOptions,
} from '@blockfrost/blockfrost-js/lib/types';
import { BaseError } from '@/app/errors';

/**
 * this code is copy pasta from blockfrost-js client
 * but it uses fetch instead of got (as got does not work with Bun)
 * source: https://github.com/blockfrost/blockfrost-js
 * api spec: https://docs.blockfrost.io/#section/Limits
 */
export default class BlockFrostApi {
  private api_url = 'https://cardano-mainnet.blockfrost.io/api/v0';
  private project_id: string;

  constructor({ projectId }: { projectId: string }) {
    this.project_id = projectId;
  }

  private getPaginationOptions(options?: PaginationOptions): { page: number; count: number; order: 'asc' | 'desc' } {
    if (!options) return { page: 1, count: 100, order: 'asc' };
    return { page: options.page || 1, count: options.count || 100, order: options.order || 'asc' };
  }

  private getAllMethodOptions(options?: AllMethodOptions): { batchSize: number; order: 'asc' | 'desc' } {
    if (!options) return { batchSize: 10, order: 'asc' };
    return { batchSize: options.batchSize || 1, order: options.order || 'asc' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: ignore
  private async paginateMethod<T extends (pagination: PaginationOptions, options?: AdditionalEndpointOptions) => any>(
    fn: T,
  ): Promise<ReturnType<T>> {
    const res = [];
    let page = 1;
    const count = 100;
    const options = this.getAllMethodOptions(undefined);
    const getSlice = () => {
      const promises = [...Array(options.batchSize).keys()].map((i) =>
        fn({ page: page + i, count, order: options.order }),
      );
      page += options.batchSize;
      return promises;
    };
    while (true) {
      const pages = await Promise.all(getSlice());
      for (const p of pages) {
        res.push(...p);
        if (p.length < count) {
          return res as ReturnType<T>; // yikes
        }
      }
    }
  }

  public async txSubmit(transaction: string | Uint8Array): ReturnType<BlockFrostAPI['txSubmit']> {
    const tx = (() => {
      if (typeof transaction === 'string') return Buffer.from(transaction, 'hex');
      return Buffer.from(transaction);
    })();

    const res = await fetch(`${this.api_url}/tx/submit`, {
      body: tx,
      method: 'POST',
      headers: { project_id: this.project_id, 'Content-type': 'application/cbor' },
    });

    const response = await res.json();

    if (!res.ok) throw new BaseError(response.status_code, response.message);
    return response;
  }

  public async account(address: string): ReturnType<BlockFrostAPI['accounts']> {
    const res = await fetch(`${this.api_url}/accounts/${address}`, { headers: { project_id: this.project_id } });
    if (!res.ok) throw new Error(await res.json());
    return await res.json();
  }

  public async addresses(address: string): ReturnType<BlockFrostAPI['addresses']> {
    const res = await fetch(`${this.api_url}/addresses/${address}`, { headers: { project_id: this.project_id } });
    if (!res.ok) throw new Error(await res.json());
    return await res.json();
  }

  public async poolsById(pool_id: string): ReturnType<BlockFrostAPI['poolsById']> {
    const res = await fetch(`${this.api_url}/pools/${pool_id}`, { headers: { project_id: this.project_id } });
    if (!res.ok) throw new Error(await res.json());
    return await res.json();
  }

  public async blocks(hash_or_number: string | number): ReturnType<BlockFrostAPI['blocks']> {
    const res = await fetch(`${this.api_url}/blocks/${hash_or_number}`, { headers: { project_id: this.project_id } });
    if (!res.ok) throw new Error(await res.json());
    return await res.json();
  }

  public async txs(tx_hash: string): ReturnType<BlockFrostAPI['txs']> {
    const res = await fetch(`${this.api_url}/txs/${tx_hash}`, { headers: { project_id: this.project_id } });
    if (!res.ok) throw new Error(await res.json());
    return await res.json();
  }

  public async blocksLatest(): ReturnType<BlockFrostAPI['blocksLatest']> {
    const res = await fetch(`${this.api_url}/blocks/latest`, { headers: { project_id: this.project_id } });
    if (!res.ok) throw new Error(await res.json());
    return await res.json();
  }

  public async accountsRegistrationsAll(stake_address: string): ReturnType<BlockFrostAPI['accountsRegistrationsAll']> {
    return this.paginateMethod(async (pagination) => {
      const options = this.getPaginationOptions(pagination);
      const query = new URLSearchParams(Object.entries(options).map(([key, value]) => [key, value.toString()]));
      const res = await fetch(`${this.api_url}/accounts/${stake_address}/registrations?${query.toString()}`, {
        headers: {
          project_id: this.project_id,
        },
      });
      if (!res.ok) throw new Error(await res.json());
      return await res.json();
    });
  }

  public async accountsRewardsAll(stake_address: string): ReturnType<BlockFrostAPI['accountsRewardsAll']> {
    return this.paginateMethod(async (pagination) => {
      const options = this.getPaginationOptions(pagination);
      const query = new URLSearchParams(Object.entries(options).map(([key, value]) => [key, value.toString()]));
      const res = await fetch(`${this.api_url}/accounts/${stake_address}/rewards?${query.toString()}`, {
        headers: { project_id: this.project_id },
      });
      if (!res.ok) throw new Error(await res.json());
      return await res.json();
    });
  }

  public async accountsWithdrawalsAll(stake_address: string): ReturnType<BlockFrostAPI['accountsWithdrawalsAll']> {
    return this.paginateMethod(async (pagination) => {
      const options = this.getPaginationOptions(pagination);
      const query = new URLSearchParams(Object.entries(options).map(([key, value]) => [key, value.toString()]));
      const res = await fetch(`${this.api_url}/accounts/${stake_address}/withdrawals?${query.toString()}`, {
        headers: { project_id: this.project_id },
      });
      if (!res.ok) throw new Error(await res.json());
      return await res.json();
    });
  }

  public async addressesUtxos(
    address: string,
    pagination?: PaginationOptions,
  ): ReturnType<BlockFrostAPI['addressesUtxos']> {
    const options = this.getPaginationOptions(pagination);
    const query = new URLSearchParams(Object.entries(options).map(([key, value]) => [key, value.toString()]));
    const res = await fetch(`${this.api_url}/addresses/${address}/utxos?${query.toString()}`, {
      headers: { project_id: this.project_id },
    });
    if (!res.ok) throw new Error(await res.json());
    return await res.json();
  }
}
