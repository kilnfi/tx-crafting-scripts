import CosmosService from '@/COSMOS/CosmosService';

export default class FetService extends CosmosService<'fet'> {
  constructor() {
    super('fet', { endpoint: process.env.FET_RPC_URL as string });
  }
}
