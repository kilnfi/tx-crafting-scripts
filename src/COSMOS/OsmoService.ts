import CosmosService from '@/COSMOS/CosmosService';

export class OsmoService extends CosmosService<'osmo'> {
  constructor() {
    super('osmo', { endpoint: process.env.OSMO_RPC_URL as string });
  }
}
