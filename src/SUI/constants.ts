import { suiToMist } from '@/SUI/utils';

export const SUI_MIN_STAKE = '1';
export const SUI_MIN_STAKE_IN_MIST = suiToMist(SUI_MIN_STAKE);

export const STAKED_SUI_TYPE_ID = '0x3::staking_pool::StakedSui';

export const SUI_OPERATIONS = {
  request_withdraw_stake: '0x3::sui_system::request_withdraw_stake',
  request_add_stake: '0x3::sui_system::request_add_stake',
  split_staked_sui: '0x3::staking_pool::split_staked_sui',
  join_staked_sui: '0x3::staking_pool::join_staked_sui',
};
