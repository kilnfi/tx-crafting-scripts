export const TOKENS = ['DOT', 'KSM'] as const;
export type SubstrateToken = (typeof TOKENS)[number];

type Registry = {
  rpcUrl: string;
};

export const REGISTRIES: Record<SubstrateToken, Registry> = {
  DOT: {
    rpcUrl: process.env.DOT_RPC_URL as string,
  },
  KSM: {
    rpcUrl: process.env.KSM_RPC_URL as string,
  },
};
