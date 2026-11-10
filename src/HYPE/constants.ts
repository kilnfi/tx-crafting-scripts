import type { HypeNetwork } from '@/HYPE/types';

/** Hyperliquid API base URLs (exchange + info endpoints) */
export const HYPE_API_URLS: Record<HypeNetwork, string> = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz',
};

/** HyperEVM chain ids: the default EIP-712 domain chainId, what the Fireblocks HYPE_ETH asset signs with */
export const HYPE_SIGNATURE_CHAIN_IDS: Record<HypeNetwork, `0x${string}`> = { mainnet: '0x3e7', testnet: '0x3e6' };

/** Sending HYPE to this address on HyperCore credits the sender's own HyperEVM address */
export const HYPE_SYSTEM_ADDRESS = '0x2222222222222222222222222222222222222222';

export const HYPE_EIP712_DOMAIN_NAME = 'HyperliquidSignTransaction';
export const HYPE_EIP712_DOMAIN_VERSION = '1';
export const HYPE_EIP712_VERIFYING_CONTRACT = '0x0000000000000000000000000000000000000000';

export const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const;

// EIP-712 types of the user-signed staking actions (ref: hyperliquid-python-sdk, nktkas/hyperliquid)
export const HYPE_ACTION_TYPES = {
  cDeposit: {
    primaryType: 'HyperliquidTransaction:CDeposit',
    fields: [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'wei', type: 'uint64' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
  cWithdraw: {
    primaryType: 'HyperliquidTransaction:CWithdraw',
    fields: [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'wei', type: 'uint64' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
  sendAsset: {
    primaryType: 'HyperliquidTransaction:SendAsset',
    fields: [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'destination', type: 'string' },
      { name: 'sourceDex', type: 'string' },
      { name: 'destinationDex', type: 'string' },
      { name: 'token', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'fromSubAccount', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
  tokenDelegate: {
    primaryType: 'HyperliquidTransaction:TokenDelegate',
    fields: [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'validator', type: 'address' },
      { name: 'wei', type: 'uint64' },
      { name: 'isUndelegate', type: 'bool' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
} as const;
