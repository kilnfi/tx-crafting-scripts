import CosmosService from '@/COSMOS/CosmosService';

export class CroService extends CosmosService<'cro'> {
  constructor() {
    super('cro', { endpoint: process.env.CRO_RPC_URL as string });
  }
}
