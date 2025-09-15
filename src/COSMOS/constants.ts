import type { Token, TokenUnit } from '@/COSMOS/types';

export const TOKEN_UNIT_MAP: Record<Token, TokenUnit> = {
  atom: 'uatom',
  osmo: 'uosmo',
  dydx: 'adydx',
  tia: 'utia',
  zeta: 'azeta',
  noble: 'uusdc',
  fet: 'afet',
  inj: 'inj',
  kava: 'ukava',
  om: 'uom',
  cro: 'basecro',
  sei: 'usei',
};

export const GAS_MAPPING: Record<Token, string> = {
  osmo: '0.025uosmo',
  atom: '0.025uatom',
  om: '0.025uom',
  dydx: '12500000000adydx',
  tia: '0.002utia',
  zeta: '10100000000azeta',
  noble: '0.1uusdc',
  fet: '300000afet',
  inj: '160000000inj',
  kava: '0.05ukava',
  cro: '0.05basecro',
  sei: '0.05usei',
};

export const ADDRESS_PREFIX_MAP: Record<Token, string> = {
  atom: 'cosmos',
  osmo: 'osmo',
  om: 'mantra',
  dydx: 'dydx',
  tia: 'celestia',
  zeta: 'zeta',
  noble: 'noble',
  fet: 'fetch',
  inj: 'inj',
  kava: 'kava',
  cro: 'cro',
  sei: 'sei',
};
