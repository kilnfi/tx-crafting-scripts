import '@polkadot/api-augment';
import { ApiPromise, HttpProvider } from '@polkadot/api';
import { CouldNotBroadcastTx, CouldNotCraftTx, CouldNotPrepareTx } from '@/app/errors';
import { REGISTRIES, type SubstrateToken } from '@/Substrate/constants';
import SubstrateUtils from '@/Substrate/SubstrateUtils';
import type { PolkadotTx } from '@/Substrate/types';

export default abstract class SubstrateService {
  protected readonly utils;

  constructor(private token: SubstrateToken) {
    this.utils = new SubstrateUtils(this.token);
  }

  public get client() {
    return ApiPromise.create({ provider: new HttpProvider(REGISTRIES[this.token].rpcUrl) });
  }

  /**
   * Prepare a transaction
   *
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx({
    unsigned_tx_serialized,
    signature,
  }: {
    unsigned_tx_serialized: string;
    signature: `0x${string}`;
  }): Promise<{ signed_tx_serialized: string }> {
    try {
      const unsigned = this.utils.deserializeTx(unsigned_tx_serialized);
      const client = await this.utils.client;

      const signer_payload = client.registry.createType('SignerPayload', unsigned);

      const extrinsic = client.registry.createType('Extrinsic', signer_payload.method);
      extrinsic.addSignature(signer_payload.address, signature, signer_payload.toPayload());

      return { signed_tx_serialized: extrinsic.toHex() };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Craft a withdraw unbonded transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftWithdrawUnbondedTx(stash_account: string): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.withdrawUnbonded(1);
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft an withdraw unbound from pool transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftWithdrawUnbondedFromPoolTx(member_account: string): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.nominationPools.withdrawUnbonded(member_account, 1);
      const txInfo = await this.utils.txInfo(member_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft an unbond transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftUnbondTx({
    amount_planck,
    stash_account,
  }: {
    stash_account: string;
    amount_planck: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.unbond(amount_planck);
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft an unbound from pool transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftUnbondFromPoolTx({
    member_account,
    amount_planck,
  }: {
    member_account: string;
    amount_planck: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.nominationPools.unbond(member_account, amount_planck);
      const txInfo = await this.utils.txInfo(member_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a set payee transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftSetPayeeTx({
    stash_account,
    reward_destination,
  }: {
    stash_account: string;
    reward_destination: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.setPayee(reward_destination);
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a rebond transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftRebondTx({
    amount_planck,
    stash_account,
  }: {
    stash_account: string;
    amount_planck: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.rebond(amount_planck);
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a nominate transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftNominateTx({
    stash_account,
    validator_addresses,
  }: {
    stash_account: string;
    validator_addresses: string[];
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.nominate(validator_addresses);
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a join pool transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftJoinPoolTx({
    amount_planck,
    member_account,
    pool_id,
  }: {
    member_account: string;
    pool_id: string;
    amount_planck: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.nominationPools.join(amount_planck, pool_id);
      const txInfo = await this.utils.txInfo(member_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Broadcasts a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx(tx_serialized: string): Promise<{ tx_hash: string }> {
    try {
      const tx_hash = await (await this.client).rpc.author.submitExtrinsic(tx_serialized);
      return { tx_hash: tx_hash.toString() };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }

  /**
   * Craft a bond extra to pool transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftBondExtraToPoolTx({
    amount_planck,
    member_account,
  }: {
    member_account: string;
    amount_planck: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.nominationPools.bondExtra({
        FreeBalance: amount_planck,
      });
      const txInfo = await this.utils.txInfo(member_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a claim payout from pool transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftClaimPayoutFromPoolTx(member_account: string): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.nominationPools.claimPayout();
      const txInfo = await this.utils.txInfo(member_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a chill transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftChillTx(stash_account: string): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.chill();
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a bond transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftBondTx({
    amount_planck,
    stash_account,
    reward_destination,
  }: {
    stash_account: string;
    amount_planck: string;
    reward_destination: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.bond(amount_planck, reward_destination);
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a bond rewards to pool transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftBondRewardsToPoolTx(member_account: string): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.nominationPools.bondExtra('');
      const txInfo = await this.utils.txInfo(member_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft a bond extra transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftBondExtraTx({
    amount_planck,
    stash_account,
  }: {
    stash_account: string;
    amount_planck: string;
  }): Promise<PolkadotTx> {
    try {
      const call = (await this.utils.client).tx.staking.bondExtra(amount_planck);
      const txInfo = await this.utils.txInfo(stash_account);
      return this.utils.craftTx(call, txInfo);
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }
}
