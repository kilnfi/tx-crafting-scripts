import CosmosService from '@/COSMOS/CosmosService';

export class TiaService extends CosmosService<'tia'> {
  constructor() {
    super('tia', { endpoint: process.env.TIA_RPC_URL as string });
  }
}
