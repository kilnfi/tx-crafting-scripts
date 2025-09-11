import Long from 'long';
import _m0 from 'protobufjs/minimal';

export interface MsgDepositForBurn {
  from: string;
  amount: string;
  destinationDomain: number;
  mintRecipient: Uint8Array;
  burnToken: string;
}

function createBaseMsgDepositForBurn(): MsgDepositForBurn {
  return { from: '', amount: '', destinationDomain: 0, mintRecipient: new Uint8Array(0), burnToken: '' };
}

export const MsgDepositForBurn = {
  encode(message: MsgDepositForBurn, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.from !== '') {
      writer.uint32(10).string(message.from);
    }
    if (message.amount !== '') {
      writer.uint32(18).string(message.amount);
    }
    if (message.destinationDomain !== 0) {
      writer.uint32(24).uint32(message.destinationDomain);
    }
    if (message.mintRecipient.length !== 0) {
      writer.uint32(34).bytes(message.mintRecipient);
    }
    if (message.burnToken !== '') {
      writer.uint32(42).string(message.burnToken);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgDepositForBurn {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgDepositForBurn();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.from = reader.string();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.amount = reader.string();
          continue;
        case 3:
          if (tag !== 24) {
            break;
          }

          message.destinationDomain = reader.uint32();
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.mintRecipient = reader.bytes();
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.burnToken = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  // biome-ignore lint: codegen
  fromJSON(object: any): MsgDepositForBurn {
    return {
      from: isSet(object.from) ? globalThis.String(object.from) : '',
      amount: isSet(object.amount) ? globalThis.String(object.amount) : '',
      destinationDomain: isSet(object.destinationDomain) ? globalThis.Number(object.destinationDomain) : 0,
      mintRecipient: isSet(object.mintRecipient) ? bytesFromBase64(object.mintRecipient) : new Uint8Array(0),
      burnToken: isSet(object.burnToken) ? globalThis.String(object.burnToken) : '',
    };
  },

  toJSON(message: MsgDepositForBurn): unknown {
    // biome-ignore lint: codegen
    const obj: any = {};
    if (message.from !== '') {
      obj.from = message.from;
    }
    if (message.amount !== '') {
      obj.amount = message.amount;
    }
    if (message.destinationDomain !== 0) {
      obj.destinationDomain = Math.round(message.destinationDomain);
    }
    if (message.mintRecipient.length !== 0) {
      obj.mintRecipient = base64FromBytes(message.mintRecipient);
    }
    if (message.burnToken !== '') {
      obj.burnToken = message.burnToken;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<MsgDepositForBurn>, I>>(base?: I): MsgDepositForBurn {
    // biome-ignore lint: codegen
    return MsgDepositForBurn.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<MsgDepositForBurn>, I>>(object: I): MsgDepositForBurn {
    const message = createBaseMsgDepositForBurn();
    message.from = object.from ?? '';
    message.amount = object.amount ?? '';
    message.destinationDomain = object.destinationDomain ?? 0;
    message.mintRecipient = object.mintRecipient ?? new Uint8Array(0);
    message.burnToken = object.burnToken ?? '';
    return message;
  },
};

function bytesFromBase64(b64: string): Uint8Array {
  if (globalThis.Buffer) {
    return Uint8Array.from(globalThis.Buffer.from(b64, 'base64'));
  }
  const bin = globalThis.atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; ++i) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

function base64FromBytes(arr: Uint8Array): string {
  if (globalThis.Buffer) {
    return globalThis.Buffer.from(arr).toString('base64');
  }
  const bin: string[] = [];
  arr.forEach((byte) => {
    bin.push(globalThis.String.fromCharCode(byte));
  });
  return globalThis.btoa(bin.join(''));
}

// biome-ignore lint/complexity/noBannedTypes: ignore
type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends Long
    ? string | number | Long
    : T extends globalThis.Array<infer U>
      ? globalThis.Array<DeepPartial<U>>
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepPartial<U>>
        : // biome-ignore lint: codegen
          T extends {}
          ? { [K in keyof T]?: DeepPartial<T[K]> }
          : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin
  ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

if (_m0.util.Long !== Long) {
  // biome-ignore lint: codegen
  _m0.util.Long = Long as any;
  _m0.configure();
}

// biome-ignore lint: codegen
function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
