import { getSecureRandomBytes } from '@ton/crypto';
import { Address as CoreAddress, TonClient, toNano } from '@ton/ton';
import TonWeb from 'tonweb';
import type { Cell } from 'tonweb/dist/types/boc/cell';
import {
  AddressNotFoundError,
  CouldNotBroadcastTx,
  CouldNotFindTxStatus,
  CouldNotGetTxStatus,
  CouldNotPrepareTx,
} from '@/errors/errors';
import { VESTING_CONTRACT_OPCODES, WHALES_NOMINATOR_CONTRACT_OPCODES } from '@/TON/constants';
import {
  TonPoolNotActiveError,
  TonVestingContractNotOwnerOfPoolError,
  TonWalletNotActiveError,
  TonWalletNotOwnerOfPoolError,
  TonWalletNotOwnerOfVestingContractError,
  TonWalletNotSenderOfVestingContractError,
} from '@/TON/errors';
import { TonParser } from '@/TON/TonParser';
import type { TonTx, WalletInfo } from '@/TON/types';

const TON_WHALES_POOLS = [
  'EQBDeq6wDuTBDkKUlXSfUBdbxz1z4v1nNX8vBOEgz2IA-IQS',
  'EQCGXN12Cezmurk-BdzagP7bR1bp7GT-JrGDm8juleoVGzbI',
];

export default class TonService {
  private readonly tonClient: TonClient;
  private readonly tonWeb: TonWeb;

  constructor() {
    this.tonClient = new TonClient({
      endpoint: `${this.getClientUrl()}/api/v2/jsonRPC`,
      apiKey: process.env.TON_CENTER_API_KEY,
    });

    this.tonWeb = new TonWeb(
      new TonWeb.HttpProvider(`${this.getClientUrl()}/api/v2/jsonRPC`, {
        apiKey: process.env.TON_CENTER_API_KEY,
      }),
    );
  }

  private getClientUrl() {
    return 'https://toncenter.com';
  }

  /**
   * Get the status of a transaction
   *
   * @throws {CouldNotGetTxStatus} if the transaction could not be found
   */
  public async txStatus(msg_hash: string, direction?: string) {
    try {
      // replace all whitespaces with + and encode the message hash
      const encoded_msg_hash = encodeURIComponent(msg_hash.replaceAll(/\s/g, '+'));
      const uri = `${this.getClientUrl()}/api/v3/transactionsByMessage?direction=${direction ?? 'in'}&msg_hash=${encoded_msg_hash}&limit=128&offset=0`;
      const data = await fetch(uri, {
        method: 'GET',
        headers: {
          'X-API-Key': process.env.TON_CENTER_API_KEY as string,
        },
      });
      const res = await data.json();
      if (res?.transactions?.length === 0) {
        throw new CouldNotFindTxStatus();
      }
      return res;
    } catch (err) {
      throw new CouldNotGetTxStatus(err);
    }
  }

  /**
   * Decode a transaction
   *
   * @throws {CouldNotDecodeTx} if the transaction could not be decoded
   */
  public async decodeTx(tx_serialized: string): Promise<object> {
    try {
      const boc = TonWeb.boc.Cell.fromBoc(tx_serialized);
      const cells = [];
      for (let i = 0; i < boc.length; i++) {
        cells.push({
          body: new TonParser(boc[i]).parseTx(),
          message: new TonParser(boc[i].refs[0]).parseCommonMsgInfo(),
        });
      }
      return { ...cells };
    } catch (err) {
      throw new CouldNotGetTxStatus(err);
    }
  }

  /**
   * Craft a stake transaction (transfer) to a single nomination pool
   */
  public async craftStakeSingleNominationPoolTx({
    wallet,
    amount_nanoton,
    pool_address,
    vesting_contract_address,
  }: {
    wallet: string;
    pool_address: string;
    amount_nanoton: string;
    vesting_contract_address: string | null;
  }): Promise<TonTx> {
    // check if the wallet is active
    const wallet_info = await this.getWalletInfo(wallet);
    if (!wallet_info.wallet || wallet_info.account_state !== 'active') {
      throw new TonWalletNotActiveError(wallet);
    }

    // check if the pool is active
    const pool_info = await this.getWalletInfo(pool_address);
    if (pool_info.account_state !== 'active') {
      throw new TonPoolNotActiveError(pool_address);
    }

    // check if the nominator is the pool owner
    const pool_owner = CoreAddress.parse((await this.getSingleNominatorContractOwner(pool_address)).address);
    if (vesting_contract_address && !pool_owner.equals(CoreAddress.parse(vesting_contract_address))) {
      throw new TonVestingContractNotOwnerOfPoolError(vesting_contract_address, pool_address);
    }
    if (!vesting_contract_address && !pool_owner.equals(CoreAddress.parse(wallet))) {
      throw new TonWalletNotOwnerOfPoolError(wallet, pool_address);
    }

    const pool = new TonWeb.Address(pool_address);
    const payload = new TonWeb.boc.Cell();
    let header: Cell;

    if (vesting_contract_address) {
      // check if the wallet is the owner of the vesting contract
      if (!(await this.isVestingContractOwner(vesting_contract_address, wallet))) {
        throw new TonWalletNotOwnerOfVestingContractError(wallet, vesting_contract_address);
      }

      const vesting_contract = new TonWeb.Address(vesting_contract_address);
      const out_amount = new TonWeb.utils.BN(toNano('0.1').toString());
      // @ts-expect-error the VestingWalletV1 is not typed but it exists (magic)
      const vesting_wallet = new TonWeb.LockupWallets.VestingWalletV1(this.tonWeb.provider, {
        address: vesting_contract,
      });

      const vesting_payload = vesting_wallet.createInternalTransfer({
        address: pool,
        amount: new TonWeb.utils.BN(amount_nanoton),
      });

      payload.writeCell(vesting_payload);
      header = TonWeb.Contract.createInternalMessageHeader(vesting_contract, out_amount);
    } else {
      header = TonWeb.Contract.createInternalMessageHeader(pool, new TonWeb.utils.BN(amount_nanoton));
    }

    const message = TonWeb.Contract.createCommonMsgInfo(header, undefined, payload);

    return await this.buildTx(message, wallet_info.seqno, wallet, pool_address, amount_nanoton, payload);
  }

  /**
   * Craft an unstake transaction (withdraw) from a single nomination pool
   */
  public async craftUnstakeSingleNominationPoolTx({
    wallet,
    amount_nanoton,
    pool_address,
    vesting_contract_address,
  }: {
    wallet: string;
    pool_address: string;
    amount_nanoton: string | null;
    vesting_contract_address: string | null;
  }): Promise<TonTx> {
    // check if the wallet is active
    const wallet_info = await this.getWalletInfo(wallet);
    if (!wallet_info.wallet || wallet_info.account_state !== 'active') {
      throw new TonWalletNotActiveError(wallet);
    }

    // check if the pool is active
    const pool_info = await this.getWalletInfo(pool_address);
    if (pool_info.account_state !== 'active') {
      throw new TonPoolNotActiveError(pool_address);
    }

    const amount = amount_nanoton ?? pool_info.balance;
    const pool = new TonWeb.Address(pool_address);
    const out_amount = new TonWeb.utils.BN(toNano('0.1').toString());

    const withdraw_payload = new TonWeb.boc.Cell();
    withdraw_payload.bits.writeUint(VESTING_CONTRACT_OPCODES.single_nominator_pool_withdraw, 32);
    withdraw_payload.bits.writeUint(0, 64);
    withdraw_payload.bits.writeCoins(new TonWeb.utils.BN(amount));

    let header: Cell;
    let message_payload: Cell;

    if (vesting_contract_address) {
      // check if the wallet is the owner of the vesting contract
      if (!(await this.isVestingContractOwner(vesting_contract_address, wallet))) {
        throw new TonWalletNotOwnerOfVestingContractError(wallet, vesting_contract_address);
      }

      const vesting_contract = new TonWeb.Address(vesting_contract_address);
      // @ts-expect-error the VestingWalletV1 is not typed but it exists (magic)
      const vesting_wallet = new TonWeb.LockupWallets.VestingWalletV1(this.tonWeb.provider, {
        address: vesting_contract,
      });

      const vesting_payload = vesting_wallet.createInternalTransfer({
        address: pool,
        amount: out_amount.toString(),
        payload: withdraw_payload,
      });

      header = TonWeb.Contract.createInternalMessageHeader(vesting_contract, out_amount);
      message_payload = new TonWeb.boc.Cell();
      message_payload.writeCell(vesting_payload);
    } else {
      header = TonWeb.Contract.createInternalMessageHeader(pool, out_amount);
      message_payload = withdraw_payload;
    }

    const message = TonWeb.Contract.createCommonMsgInfo(header, undefined, message_payload);
    return await this.buildTx(message, wallet_info.seqno, wallet, pool_address, out_amount.toString(), message_payload);
  }

  /**
   * Craft a whitelist transaction for a vesting contract
   */
  public async craftVestingContractWhitelistTx({
    wallet,
    vesting_contract_address,
    addresses,
  }: {
    wallet: string;
    vesting_contract_address: string;
    addresses: string[];
  }): Promise<TonTx> {
    // check if the wallet is active
    const wallet_info = await this.getWalletInfo(wallet);
    if (!wallet_info.wallet || wallet_info.account_state !== 'active') {
      throw new TonWalletNotActiveError(wallet);
    }

    if (!(await this.isVestingContractSender(vesting_contract_address, wallet))) {
      throw new TonWalletNotSenderOfVestingContractError(wallet, vesting_contract_address);
    }

    const payload = new TonWeb.boc.Cell();
    payload.bits.writeUint(VESTING_CONTRACT_OPCODES.add_whitelist, 32);
    payload.bits.writeUint(0, 64);
    payload.bits.writeAddress(new TonWeb.Address(addresses[0]));

    let cell: Cell | null = null;

    for (let i = addresses.length - 1; i >= 1; i--) {
      const newCell = new TonWeb.boc.Cell();
      newCell.bits.writeAddress(new TonWeb.Address(addresses[i]));

      if (cell) {
        newCell.writeCell(cell);
      }

      cell = newCell;
    }

    if (cell) {
      payload.writeCell(cell);
    }

    const vesting_contract = new TonWeb.Address(vesting_contract_address);
    const order_header = TonWeb.Contract.createInternalMessageHeader(vesting_contract, new TonWeb.utils.BN(0));
    const out_message = TonWeb.Contract.createCommonMsgInfo(order_header, undefined, payload);

    return await this.buildTx(out_message, wallet_info.seqno, wallet, vesting_contract_address, '0', payload);
  }

  /**
   * Craft a stake transaction to a ton whales pool
   */
  public async craftStakeTonWhalesTx({
    wallet,
    amount_nanoton,
    pool_address,
    vesting_contract_address,
  }: {
    wallet: string;
    amount_nanoton: string;
    pool_address: string | null;
    vesting_contract_address: string | null;
  }): Promise<TonTx & { pool_address: string } /** for tagging the stake as the pool_address is nullable */> {
    // check if the wallet is active
    const wallet_info = await this.getWalletInfo(wallet);
    if (!wallet_info.wallet || wallet_info.account_state !== 'active') {
      throw new TonWalletNotActiveError(wallet);
    }

    // check if the pool is active
    if (pool_address) {
      const pool_info = await this.getWalletInfo(pool_address);
      if (pool_info.account_state !== 'active') {
        throw new TonPoolNotActiveError(pool_address);
      }
    }

    const destination_pool_address = pool_address ?? (await this.getKilnTonWhalesPool());
    const pool = new TonWeb.Address(destination_pool_address);

    const deposit_payload = new TonWeb.boc.Cell();
    deposit_payload.bits.writeUint(0, 32);
    deposit_payload.bits.writeString('Deposit');

    let header: Cell;
    let message_payload: Cell;

    if (vesting_contract_address) {
      // check if the wallet is the owner of the vesting contract
      if (!(await this.isVestingContractOwner(vesting_contract_address, wallet))) {
        throw new TonWalletNotOwnerOfVestingContractError(wallet, vesting_contract_address);
      }

      const vesting_contract = new TonWeb.Address(vesting_contract_address);
      const out_amount = new TonWeb.utils.BN(toNano('0.1').toString());
      // @ts-expect-error the VestingWalletV1 is not typed but it exists (magic)
      const vesting_wallet = new TonWeb.LockupWallets.VestingWalletV1(this.tonWeb.provider, {
        address: vesting_contract,
      });

      const vesting_payload = vesting_wallet.createInternalTransfer({
        address: pool,
        amount: new TonWeb.utils.BN(amount_nanoton),
        payload: deposit_payload,
      });

      header = TonWeb.Contract.createInternalMessageHeader(vesting_contract, out_amount);
      message_payload = new TonWeb.boc.Cell();
      message_payload.writeCell(vesting_payload);
    } else {
      header = TonWeb.Contract.createInternalMessageHeader(pool, new TonWeb.utils.BN(amount_nanoton));
      message_payload = deposit_payload;
    }

    const message = TonWeb.Contract.createCommonMsgInfo(header, undefined, message_payload);

    const tx = await this.buildTx(
      message,
      wallet_info.seqno,
      wallet,
      destination_pool_address,
      amount_nanoton,
      message_payload,
    );

    return { ...tx, pool_address: destination_pool_address };
  }

  /**
   * Craft an unstake transaction to a ton whales pool
   */
  public async craftUnstakeTonWhalesTx({
    wallet,
    pool_address,
    amount_nanoton,
    vesting_contract_address,
  }: {
    wallet: string;
    pool_address: string;
    amount_nanoton: string | null;
    vesting_contract_address: string | null;
  }): Promise<TonTx> {
    // check if the wallet is active
    const wallet_info = await this.getWalletInfo(wallet);
    if (!wallet_info.wallet || wallet_info.account_state !== 'active') {
      throw new TonWalletNotActiveError(wallet);
    }

    // check if the pool is active
    if (pool_address) {
      const pool_info = await this.getWalletInfo(pool_address);
      if (pool_info.account_state !== 'active') {
        throw new TonPoolNotActiveError(pool_address);
      }
    }

    const unstake_payload = new TonWeb.boc.Cell();
    if (!amount_nanoton) {
      unstake_payload.bits.writeUint(0, 32);
      unstake_payload.bits.writeString('Withdraw');
    } else {
      const gas_limit = new TonWeb.utils.BN(100000);
      const query_id = new TonWeb.utils.BN(await getSecureRandomBytes(64 / 8));

      unstake_payload.bits.writeUint(WHALES_NOMINATOR_CONTRACT_OPCODES.stake_withdraw, 32); // unstake opcode
      unstake_payload.bits.writeUint(query_id, 64);
      unstake_payload.bits.writeCoins(new TonWeb.utils.BN(gas_limit));
      unstake_payload.bits.writeCoins(new TonWeb.utils.BN(amount_nanoton));
    }

    const pool = new TonWeb.Address(pool_address);
    const out_amount = new TonWeb.utils.BN(toNano('0.2').toString());

    let header: Cell;
    let message_payload: Cell;

    if (vesting_contract_address) {
      if (!(await this.isVestingContractOwner(vesting_contract_address, wallet))) {
        throw new TonWalletNotOwnerOfVestingContractError(wallet, vesting_contract_address);
      }

      const vesting_contract = new TonWeb.Address(vesting_contract_address);
      // @ts-expect-error the VestingWalletV1 is not typed but it exists (magic)
      const vesting_wallet = new TonWeb.LockupWallets.VestingWalletV1(this.tonWeb.provider, {
        address: vesting_contract,
      });

      const vesting_payload = vesting_wallet.createInternalTransfer({
        address: pool,
        amount: new TonWeb.utils.BN(toNano('0.2').toString()),
        payload: unstake_payload,
      });

      header = TonWeb.Contract.createInternalMessageHeader(vesting_contract, out_amount);
      message_payload = new TonWeb.boc.Cell();
      message_payload.writeCell(vesting_payload);
    } else {
      header = TonWeb.Contract.createInternalMessageHeader(pool, out_amount);
      message_payload = unstake_payload;
    }

    const message = TonWeb.Contract.createCommonMsgInfo(header, undefined, message_payload);

    return await this.buildTx(message, wallet_info.seqno, wallet, pool_address, out_amount.toString(), message_payload);
  }

  /**
   * Prepare a transaction
   *
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx({
    signature,
    unsigned_tx_serialized,
    from,
  }: {
    unsigned_tx_serialized: string;
    signature: string;
    from: string;
  }): Promise<{ signed_tx_serialized: string }> {
    try {
      const body = new TonWeb.boc.Cell();
      body.bits.writeBytes(new Uint8Array(Buffer.from(signature, 'hex')));
      const payload_cell = TonWeb.boc.Cell.fromBoc(unsigned_tx_serialized)[0];
      body.writeCell(payload_cell);

      const from_address = new TonWeb.Address(from);
      const header = TonWeb.Contract.createExternalMessageHeader(from_address);
      const message = TonWeb.Contract.createCommonMsgInfo(header, undefined, body);

      const hex = await message.toBoc(false);

      return {
        signed_tx_serialized: TonWeb.utils.bytesToBase64(hex),
      };
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Get the balance of an address
   */
  public async getBalance(address: string): Promise<{ amount: string; denom: 'nanoton' }> {
    try {
      const balance = await this.tonWeb.getBalance(address);
      return { amount: balance, denom: 'nanoton' };
    } catch (err) {
      throw new AddressNotFoundError(address, err);
    }
  }

  /**
   * Broadcasts a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx(tx_serialized: string): Promise<{ tx_hash: string }> {
    try {
      const data = await fetch(`${this.getClientUrl()}/api/v2/sendBocReturnHash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.TON_CENTER_API_KEY as string,
        },
        body: JSON.stringify({ boc: tx_serialized }),
      });
      const res = await data.json();
      if (!res.ok) {
        throw new CouldNotBroadcastTx(res?.error);
      }
      return { tx_hash: Buffer.from(res.result.hash, 'base64').toString('hex') };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }

  /**
   * Build transaction body
   */
  private async buildTx(message: Cell, seqno: number, from: string, to: string, amount: string, payload: Cell) {
    const expiration_timestamp = Math.floor(Date.now() / 1e3) + 60 * 120; // 2 hours
    const body = new TonWeb.boc.Cell();
    body.bits.writeUint(698983191, 32); // wallet id
    body.bits.writeUint(expiration_timestamp, 32); // expiration time
    body.bits.writeUint(seqno, 32); // store seqno
    body.bits.writeUint(0, 8); // op
    body.bits.writeUint(3, 8); // store mode of our internal transaction
    body.refs.push(message);

    const hash = await body.hash();
    const hex = await body.toBoc();
    const payload_base64 = Buffer.from(await payload.toBoc()).toString('base64');

    return {
      unsigned_tx_hash: Buffer.from(hash).toString('hex'),
      unsigned_tx_serialized: Buffer.from(hex).toString('hex'),
      from,
      to,
      amount,
      payload: payload_base64,
      valid_until: expiration_timestamp,
    };
  }

  /**
   * Get single nominator contract owner
   *
   * @throws {AddressNotFoundError} if the vesting contract owner could not be retrieved
   */
  public async getSingleNominatorContractOwner(contract_address: string): Promise<{ address: string }> {
    try {
      const coreAddress = CoreAddress.parse(contract_address);
      const info = await this.tonClient.runMethod(coreAddress, 'get_roles', []);
      // https://github.com/ton-blockchain/single-nominator/blob/b6455fcf7fbaf068d0fe723a5a11988ef67f6ea7/contracts/single-nominator.fc#L196
      const owner_address = info.stack.readAddress();

      return { address: owner_address.toString() };
    } catch (err) {
      throw new AddressNotFoundError(contract_address, err);
    }
  }

  /**
   * Get vesting contract owner
   *
   * @throws {AddressNotFoundError} if the vesting contract owner could not be retrieved
   */
  public async getVestingContractOwner(contract_address: string): Promise<{ address: string }> {
    try {
      const address = CoreAddress.parse(contract_address);
      const info = await this.tonClient.runMethod(address, 'get_vesting_data', []);
      // https://github.com/ton-blockchain/vesting-contract/blob/2a63cb96942332abf92ed8425b37645fe4f41f86/contracts/vesting_wallet.fc#L362
      info.stack.skip(6);
      const owner_address = info.stack.readAddress();

      return { address: owner_address.toString() };
    } catch (err) {
      throw new AddressNotFoundError(contract_address, err);
    }
  }

  /**
   * Check whether given address is the vesting contract owner
   */
  private async isVestingContractOwner(vesting_contract_address: string, address: string): Promise<boolean> {
    const ownerAddress = await this.getVestingContractOwner(vesting_contract_address);
    return CoreAddress.parse(address).equals(CoreAddress.parse(ownerAddress.address));
  }

  /**
   * Check whether given address is the vesting contract sender
   */
  private async isVestingContractSender(vesting_contract_address: string, address: string): Promise<boolean> {
    try {
      const vesting_contract = CoreAddress.parse(vesting_contract_address);
      const info = await this.tonClient.runMethod(vesting_contract, 'get_vesting_data', []);
      // github.com/ton-blockchain/vesting-contract/blob/2a63cb96942332abf92ed8425b37645fe4f41f86/contracts/vesting_wallet.fc#L362
      info.stack.skip(5);
      const vesting_sender_address = info.stack.readAddress();

      return CoreAddress.parse(address).equals(vesting_sender_address);
    } catch (err) {
      throw new AddressNotFoundError(vesting_contract_address, err);
    }
  }

  /**
   * Get wallet info
   */
  public async getWalletInfo(wallet: string) {
    try {
      const info = (await this.tonWeb.provider.getWalletInfo(wallet)) as WalletInfo;

      return { ...info, balance: info.balance.toString() };
    } catch (err) {
      throw new AddressNotFoundError(wallet, err);
    }
  }

  /**
   * Get the Kiln TON Whales pool with the lowest balance
   */
  public async getKilnTonWhalesPool() {
    const pools = TON_WHALES_POOLS;
    const balances = await Promise.all(
      pools.map(async (pool) => ({
        address: pool,
        balance: BigInt(await this.tonWeb.getBalance(pool)),
      })),
    );

    return balances.reduce((minPool, pool) => (pool.balance < minPool.balance ? pool : minPool)).address;
  }
}
