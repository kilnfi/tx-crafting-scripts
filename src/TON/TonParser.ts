import TonWeb from 'tonweb';
import type { Cell } from 'tonweb/dist/types/boc/cell';
import type { Address } from 'tonweb/dist/types/utils/address';
import { VESTING_CONTRACT_OPCODES, WHALES_NOMINATOR_CONTRACT_OPCODES } from '@/TON/constants';

type ParsedAddress = {
  hex: string;
  bouncable: string;
  nonBouncable: string;
};

type ParsedContractMessage = {
  op_code_name: string;
  op_code?: number;
  params?: Record<string, unknown>;
};

type ParsedCommonMsgInfo = {
  header: ParsedHeader;
  stateInit: null;
  body: ParsedContractMessage | null;
};

type ParsedHeader = {
  ihrDisabled: boolean;
  bounce: boolean;
  bounced: boolean;
  src: ParsedAddress | null;
  dest: ParsedAddress | null;
  grams: bigint;
  currencyCollection: boolean;
  ihrFees: bigint;
  fwdFees: bigint;
  createdLt: bigint;
  createdAt: bigint;
};

export class TonParser {
  public cursor: number;
  public cell: Cell;

  constructor(cell: Cell) {
    this.cursor = 0;
    this.cell = cell;
  }

  protected readBinary(idx: number): string {
    return this.cell.bits.get(idx) ? '1' : '0';
  }

  parseBoolean(): boolean {
    return this.cell.bits.get(this.cursor++);
  }

  parseGrams(): bigint {
    let first4bytes = '';

    for (let i = 0; i < 4; i++) {
      first4bytes += this.readBinary(this.cursor);
      this.cursor++;
    }

    // this.writeUint(0, 4);
    if (first4bytes === '0000') {
      return 0n;
    }

    // const l = Math.ceil((amount.toString(16).length) / 2);
    const l = Number(`0b${first4bytes}`);

    let numStr = '';

    // this.writeUint(amount, l * 8);
    for (let i = 0; i < l * 8; i++) {
      numStr += this.readBinary(this.cursor);
      this.cursor++;
    }

    return BigInt(`0b${numStr}`);
  }

  parseUint(bits: number): bigint {
    let n = BigInt(0);

    for (let i = 0; i < bits; i++) {
      n *= BigInt(2);
      n += BigInt(this.cell.bits.get(this.cursor));
      this.cursor++;
    }

    return n;
  }

  parseAddress(): Address | null {
    let first2bytes = '';

    for (let i = 0; i < 2; i++) {
      first2bytes += this.readBinary(this.cursor);
      this.cursor++;
    }

    if (first2bytes === '00') {
      return null;
    }

    if (first2bytes === '10') {
      // this.writeUint(0, 1);
      this.cursor++;

      // this.writeInt(address.wc, 8);
      let n = this.parseUint(8);
      if (n > BigInt(127)) {
        n = n - BigInt(256);
      }
      // this.writeBytes(address.hashPart)
      const hashPart = this.parseUint(256);
      if (`${n.toString(10)}:${hashPart.toString(16)}` === '0:0') return null;
      const s = `${n.toString(10)}:${hashPart.toString(16).padStart(64, '0')}`;
      return new TonWeb.Address(s);
    }

    throw new Error('Invalid address type');
  }

  parseStateInit() {
    // if (stateInit) {
    if (this.parseBoolean()) {
      // if (commonMsgInfo.bits.getFreeBits() - 1 >= stateInit.bits.getUsedBits()) {
      if (!this.parseBoolean()) {
        // stateInit is in bits
        throw new Error('Not supported: stateInit is in bits');
      }

      // statInit is in refs
    }

    return null;
  }

  parseBody() {
    // if ((commonMsgInfo.bits.getFreeBits() >= body.bits.getUsedBits()) && (commonMsgInfo.refs.length + body.refs.length <= 4)) {
    // then check if there bits left
    if (!this.parseBoolean()) {
      if (this.cursor < this.cell.bits.length) {
        // body is in bits
        return this.parseCell();
      }

      // there is no body
      return null;
    }

    // body is in refs
    return new TonParser(this.cell.refs[0]).parseCell();
  }

  parseContractOutMsg() {
    return this.parseCommonMsgInfo();
  }

  parseCell(): ParsedContractMessage {
    const op_code = Number(this.parseUint(32)); // message.bits.writeUint(opCode, 32);

    switch (op_code) {
      case VESTING_CONTRACT_OPCODES.send: {
        const query_id = this.parseUint(64); // message.bits.writeUint(params.queryId || 0, 64)
        const send_mode = this.parseUint(8); // message.bits.writeUint8(params.sendMode || 3)
        const out_msg = new TonParser(this.cell.refs[0]).parseContractOutMsg(); // message.refs.push(Contract.createOutMsg(params.address, params.amount, params.payload))

        return {
          op_code_name: 'vesting_contract_send',
          op_code,
          params: {
            query_id,
            send_mode,
            out_msg,
          },
        };
      }

      case VESTING_CONTRACT_OPCODES.single_nominator_pool_withdraw: {
        const query_id = this.parseUint(64); // message.bits.writeUint(0, 64);
        const coins = this.parseGrams(); // payload.bits.writeCoins(new TonWeb.utils.BN(amount))

        return {
          op_code_name: 'vesting_contract_single_nominator_pool_withdraw',
          op_code,
          params: {
            query_id,
            coins,
          },
        };
      }

      case VESTING_CONTRACT_OPCODES.add_whitelist: {
        const query_id = this.parseUint(64); // message.bits.writeUint(0, 64);
        const addresses = [];
        let address: Address | null;

        while (this.cursor < this.cell.bits.length) {
          address = this.parseAddress(); // newCell.bits.writeAddress(new TonWeb.Address(addresses[i]));

          address &&
            addresses.push({
              hex: address.toString(),
              bouncable: address.toString(true, true, true, false),
              nonBouncable: address.toString(true, true, false, false),
            });
        }

        return {
          op_code_name: 'vesting_contract_add_whitelist',
          op_code,
          params: {
            query_id,
            addresses,
          },
        };
      }

      case WHALES_NOMINATOR_CONTRACT_OPCODES.stake_withdraw: {
        const query_id = this.parseUint(64); // message.bits.writeUint(0, 64);
        const gas = this.parseGrams(); // payload.bits.writeCoins(new TonWeb.utils.BN(gas_limit))
        const amount = this.parseGrams(); // payload.bits.writeCoins(new TonWeb.utils.BN(amount))

        return {
          op_code_name: 'whales_nominator_contract_stake_withdraw',
          op_code,
          params: {
            query_id,
            gas,
            amount,
          },
        };
      }

      case 0: {
        const bytes = [];
        let i = 0;
        // message.bits.writeString('Deposit') | message.bits.writeString('Withdraw')
        while (this.cursor < this.cell.bits.length) {
          bytes[i] = Number(this.parseUint(8));
          i++;
        }
        const op_code_name = new TextDecoder().decode(new Uint8Array(bytes));

        return {
          op_code_name: op_code_name || 'unknown',
        };
      }

      default: {
        return {
          op_code_name: 'unknown',
          op_code,
        };
      }
    }
  }

  parseCommonMsgInfo(): ParsedCommonMsgInfo {
    // the order of the function calls is important, as they move the internal cursor
    const header = this.parseInternalMessageHeader(); // commonMsgInfo.writeCell(header);
    const stateInit = this.parseStateInit();
    const body = this.parseBody();

    return {
      header,
      stateInit,
      body,
    };
  }

  parseInternalMessageHeader(): ParsedHeader {
    // the order of the function calls is important, as they move the internal cursor
    this.parseBoolean(); // message.bits.writeBit(false);
    const ihrDisabled = this.parseBoolean(); // message.bits.writeBit(ihrDisabled);
    const bounce = this.parseBoolean(); // if ((bounce !== null)) {message.bits.writeBit(bounce);} else {message.bits.writeBit((new Address(dest)).isBounceable);}
    const bounced = this.parseBoolean(); // message.bits.writeBit(bounced);
    const src = this.parseAddress(); // message.bits.writeAddress(src ? new Address(src) : null);
    const dest = this.parseAddress(); // message.bits.writeAddress(new Address(dest));
    const grams = this.parseGrams(); // message.bits.writeGrams(gramValue);
    const currencyCollection = this.parseBoolean(); // message.bits.writeBit(Boolean(currencyCollection));
    const ihrFees = this.parseGrams(); // message.bits.writeGrams(ihrFees);
    const fwdFees = this.parseGrams(); // message.bits.writeGrams(fwdFees);
    const createdLt = this.parseUint(64); // message.bits.writeUint(createdLt, 64);
    const createdAt = this.parseUint(32); // message.bits.writeUint(createdAt, 32);

    return {
      ihrDisabled,
      bounce,
      bounced,
      src: src
        ? {
            hex: src.toString(),
            bouncable: src.toString(true, true, true, false),
            nonBouncable: src.toString(true, true, false, false),
          }
        : null,
      dest: dest
        ? {
            hex: dest.toString(),
            bouncable: dest.toString(true, true, true, false),
            nonBouncable: dest.toString(true, true, false, false),
          }
        : null,
      grams,
      currencyCollection,
      ihrFees,
      fwdFees,
      createdLt,
      createdAt,
    };
  }

  parseTx() {
    // the order of the function calls is important, as they move the internal cursor
    const wallet_id = this.parseUint(32); // body.bits.writeUint(698983191, 32);
    const expiration_timestamp = this.parseUint(32); // body.bits.writeUint(expiration_timestamp, 32);
    const seqno = this.parseUint(32); // body.bits.writeUint(seqno, 32);
    const op = this.parseUint(8); // body.bits.writeUint(0, 8);
    const store_mode = this.parseUint(8); // body.bits.writeUint(3, 8);

    return {
      wallet_id,
      expiration_timestamp,
      seqno,
      op,
      store_mode,
    };
  }
}
