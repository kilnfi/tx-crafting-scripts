import { MsgTransfer } from 'cosmjs-types/ibc/applications/transfer/v1/tx';
import { CouldNotCraftTx } from '@/app/errors';
import CosmosBaseService from '@/COSMOS/CosmosService';
import type { CosmosTx } from '@/COSMOS/types';

export default class NobleService extends CosmosBaseService<'noble'> {
  constructor() {
    super('noble', { endpoint: process.env.NOBLE_RPC_URL as string });
  }

  /**
   * Craft a burn USDC transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftBurnUsdcTx(args: { pubkey: string; recipient: string; amount_uusdc: string }): Promise<CosmosTx> {
    try {
      const { pubkey, recipient, amount_uusdc } = args;
      const cosmos_address = this.utils.pubkeyToSecp256k1Address(pubkey);

      const cleanedMintRecipient = recipient.replace(/^0x/, '');
      const zeroesNeeded = 64 - cleanedMintRecipient.length;
      const mintRecipient = '0'.repeat(zeroesNeeded) + cleanedMintRecipient;
      const buffer = Buffer.from(mintRecipient, 'hex');
      const mintRecipientBytes = new Uint8Array(buffer);

      const message = {
        typeUrl: '/circle.cctp.v1.MsgDepositForBurn',
        value: {
          from: cosmos_address,
          amount: amount_uusdc,
          destinationDomain: 0,
          mintRecipient: mintRecipientBytes,
          burnToken: 'uusdc',
        },
      };
      const tx = await this.utils.craftTx({ pubkey, messages: [message], address: cosmos_address });

      return { ...tx, pubkey, message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft an IBC transfer transaction from noble to osmosis
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftOsmoIbcTransfer(args: {
    pubkey: string;
    amount_uusdc: string;
    recipient: string;
  }): Promise<CosmosTx> {
    try {
      const { pubkey, amount_uusdc, recipient } = args;
      const cosmos_address = this.utils.pubkeyToSecp256k1Address(pubkey);

      const message = {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: MsgTransfer.fromPartial({
          sourcePort: 'transfer',
          sourceChannel: 'channel-1',
          token: {
            denom: 'uusdc',
            amount: amount_uusdc,
          },
          sender: cosmos_address,
          receiver: recipient,
          timeoutTimestamp: BigInt(Math.floor(Date.now() / 1000) * 1e9 + 10 * 60 * 1e9),
        }),
      };

      const tx = await this.utils.craftTx({ pubkey, messages: [message], address: cosmos_address });

      return { ...tx, pubkey, message };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }
}
