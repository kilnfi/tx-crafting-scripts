//https://github.com/ton-blockchain/vesting-contract/blob/2a63cb96942332abf92ed8425b37645fe4f41f86/contracts/vesting_wallet.fc
export const VESTING_CONTRACT_OPCODES = {
  add_whitelist: 0x7258a69b,
  add_whitelist_response: 0xf258a69b,
  send: 0xa7733acd,
  send_response: 0xf7733acd,
  single_nominator_pool_withdraw: 0x1000,
  single_nominator_pool_change_validator: 0x1001,
};

// https://github.com/tonwhales/ton-nominators/blob/0553e1b6ddfc5c0b60505957505ce58d01bec3e7/sources/modules/constants.fc
export const WHALES_NOMINATOR_CONTRACT_OPCODES = {
  stake_withdraw: 3665837821,
  stake_withdraw_response: 601104865,
};
