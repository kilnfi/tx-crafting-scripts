import { MsgTransfer } from 'cosmjs-types/ibc/applications/transfer/v1/tx';
import { CouldNotCraftTx, InsufficientBalanceError } from '@/app/errors';
import CosmosService from '@/COSMOS/CosmosService';
import type { CosmosTx } from '@/COSMOS/types';

export default class DydxService extends CosmosService<'dydx'> {
  constructor() {
    super('dydx', { endpoint: process.env.DYDX_RPC_URL as string });
  }

  public craftRestakeRewardsTx(args: { pubkey: string; validator_address: string }): Promise<CosmosTx> {
    void args;
    throw new Error('Method not implemented.');
  }

  /**
   * Craft an IBC transfer transaction from dydx to noble
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftNobleIbcTransfer(args: { pubkey: string; amount_uusdc: string }): Promise<CosmosTx> {
    try {
      const { pubkey, amount_uusdc } = args;
      const cosmos_address = this.utils.pubkeyToSecp256k1Address(pubkey);
      const receiver = this.utils.pubkeyToSecp256k1Address(pubkey, { prefix: 'noble' });

      const USDC_DENOM = 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';

      // check if the address has enough balance
      const balance = await (await this.client).getBalance(cosmos_address, USDC_DENOM);
      if (BigInt(balance.amount) < BigInt(amount_uusdc)) {
        throw new InsufficientBalanceError(cosmos_address, balance.amount, amount_uusdc);
      }

      const message = {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: MsgTransfer.fromPartial({
          sourcePort: 'transfer',
          sourceChannel: 'channel-0',
          token: {
            denom: USDC_DENOM,
            amount: amount_uusdc,
          },
          sender: cosmos_address,
          receiver: receiver,
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
