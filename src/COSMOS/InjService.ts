import { accountEthParser, PublicKey } from '@injectivelabs/sdk-ts';
import CosmosService from '@/COSMOS/CosmosService';
import { InjAddressDerivationMismatchError } from '@/COSMOS/errors';

export default class InjService extends CosmosService<'inj'> {
  constructor() {
    super('inj', { endpoint: process.env.INJ_RPC_URL as string, accountParser: accountEthParser });
  }

  public pubkeyToEthSecp256k1Address(pubkey: string): string {
    return PublicKey.fromBytes(Buffer.from(pubkey, 'hex')).toAddress().toBech32();
  }

  public checkAddressUponPublicKey(pubkey: string, address: string): string {
    const secp256k1Address = this.utils.pubkeyToSecp256k1Address(pubkey);
    const ethSecp256k1Address = this.pubkeyToEthSecp256k1Address(pubkey);

    if ([secp256k1Address, ethSecp256k1Address].includes(address)) {
      return address;
    }

    throw new InjAddressDerivationMismatchError(address, pubkey);
  }
}
