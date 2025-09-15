import type { Secp256k1Pubkey } from '@cosmjs/amino';
import { Uint53 } from '@cosmjs/math';
import type { EncodeObject } from '@cosmjs/proto-signing';
import { type AccountParser, type SequenceResponse, StargateClient } from '@cosmjs/stargate';
import { Tendermint37Client } from '@cosmjs/tendermint-rpc';
import { AddressNotFoundError, invariant } from '@/errors/errors';

export type ClientOptions = Parameters<(typeof CustomStargateClient)['customConnect']>[0];

export default class CustomStargateClient extends StargateClient {
  static async customConnect({
    endpoint,
    accountParser,
  }: {
    endpoint: string;
    accountParser?: AccountParser;
  }): Promise<CustomStargateClient> {
    const tmClient = await Tendermint37Client.connect(endpoint);
    return new CustomStargateClient(tmClient, { accountParser });
  }

  /**
   * Get a validator by its address
   */
  public getValidator(validator_address: string) {
    return super.forceGetQueryClient().staking.validator(validator_address);
  }

  /**
   * Wrap the getSequence function to throw a custom error and return a 404 error
   *
   * @throws {AddressNotFoundError} if the address could not be found
   */
  async getSequence(address: string): Promise<SequenceResponse> {
    try {
      return await super.getSequence(address);
    } catch (err) {
      throw new AddressNotFoundError(address, err);
    }
  }

  // we wrap our own simulate function as we can't use the one
  // from StargateClient because it requires to have a signer
  // so we create a fake one in the custom function
  async simulate(pubkey: Secp256k1Pubkey, address: string, messages: EncodeObject[], memo: string | undefined) {
    const { sequence } = await this.getSequence(address);
    const { gasInfo } = await this.forceGetQueryClient().tx.simulate(messages, memo, pubkey, sequence);
    invariant(gasInfo, 'gasInfo should be defined');

    return Uint53.fromString(gasInfo.gasUsed.toString()).toNumber();
  }
}
