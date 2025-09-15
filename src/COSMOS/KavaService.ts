import CosmosService from '@/COSMOS/CosmosService';

export class KavaService extends CosmosService<'kava'> {
  constructor() {
    super('kava', { endpoint: process.env.KAVA_RPC_URL as string });
  }
}
