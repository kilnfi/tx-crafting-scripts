import CosmosService from '@/COSMOS/CosmosService';

export class AtomService extends CosmosService<'atom'> {
  constructor() {
    super('atom', { endpoint: process.env.ATOM_RPC_URL as string });
  }
}
