import { SUI_DECIMALS } from '@mysten/sui/utils';
import { formatUnits, parseUnits } from 'viem';

export const suiToMist = (amount: string): bigint => {
  return parseUnits(amount, SUI_DECIMALS);
};

export const mistToSui = (amount: bigint): string => {
  return formatUnits(amount, SUI_DECIMALS);
};
