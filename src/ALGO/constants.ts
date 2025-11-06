import algosdk from 'algosdk';

export const RETI_APP_ID = 2714516089n;

export const ALGO_CONSTANTS = {
  BASE_FEE: 1000,
  GAS_CALL_FEE: 1000,
  EXTRA_FEE_PER_CALL: 1000,
  OPCODES_PER_CHUNK: 700,
  FEE_PER_CHUNK: 1000,
  DEFAULT_VALIDITY_WINDOW: 200,
  RETI_APP_ADDRESS: algosdk.getApplicationAddress(Number(RETI_APP_ID)).toString(),
};

export const ALGO_ABI_METHODS = {
  GAS: algosdk.ABIMethod.fromSignature('gas()void'),
  ADD_STAKE: algosdk.ABIMethod.fromSignature('addStake(pay,uint64,uint64)(uint64,uint64,uint64)'),
  REMOVE_STAKE: algosdk.ABIMethod.fromSignature('removeStake(address,uint64)void'),
  FIND_POOL_FOR_STAKER: algosdk.ABIMethod.fromSignature(
    'findPoolForStaker(uint64,address,uint64)((uint64,uint64,uint64),bool,bool)',
  ),
  GET_VALIDATOR_CONFIG: algosdk.ABIMethod.fromSignature(
    'getValidatorConfig(uint64)(uint64,address,address,uint64,uint8,address,uint64[4],uint64,uint64,uint64,uint32,uint32,address,uint64,uint64,uint8,uint64,uint64)',
  ),
  GET_STAKER_INFO: algosdk.ABIMethod.fromSignature('getStakerInfo(address)(address,uint64,uint64,uint64,uint64)'),
};
