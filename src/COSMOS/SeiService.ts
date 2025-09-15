import CosmosService from '@/COSMOS/CosmosService';

export class SeiService extends CosmosService<'sei'> {
  constructor() {
    super('sei', { endpoint: process.env.SEI_RPC_URL as string });
  }
}
