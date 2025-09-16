// see https://js.cexplorer.io/api-static/basic/global.json
export const CARDANO_PARAMS = {
  max_tx_size: 16384,

  max_val_size: 5000,

  min_fee_a: '44',
  min_fee_b: '155381',

  pool_deposit: '500000000',

  key_deposit: '2000000',

  coins_per_utxo_size: '4310',

  min_utxo_value: '969750',
};

export const DEFAULT_NATIVE_FEES = 300000; // Over-estimate (0.3 ADA)
