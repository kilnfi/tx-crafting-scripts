import type { Token, TokenUnit } from '@/COSMOS/types';

export const TOKEN_UNIT_MAP: Record<Token, TokenUnit> = {
  atom: 'uatom',
};

export const GAS_MAPPING: Record<Token, string> = {
  atom: '0.025uatom',
};

export const ADDRESS_PREFIX_MAP: Record<Token, string> = {
  atom: 'cosmos',
};
