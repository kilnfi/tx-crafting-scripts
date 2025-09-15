import CosmosService from '@/COSMOS/CosmosService';

export class OmService extends CosmosService<'om'> {
  constructor() {
    super('om', { endpoint: process.env.OM_RPC_URL as string });
  }
}
