# Transactions crafting scripts

### ⚠️ Disclaimer

- Kiln is a non-custodial staking provider. As the customer and ultimate owner of your assets, **it is your sole responsibility to review, check, and verify all transactions before signing and broadcasting them.**
- Kiln may provide certain tooling (such as web applications, APIs, or scripts) to facilitate interaction with supported protocols. These tools are provided for convenience only. They do not constitute advice, nor do they alter the fact that you remain solely responsible for the transactions you generate, sign, and broadcast.
- Kiln does not have access to your private keys and cannot execute, reverse, or validate transactions on your behalf. Kiln disclaims any responsibility or liability for the use of these scripts, including (without limitation) for missed staking rewards, slashing penalties, opportunity costs, or other losses  (as defined in your agreement with Kiln).
- This repository and the associated code are provided “AS IS” and “AS AVAILABLE,” without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
- **In no event shall Kiln, its affiliates, or its contributors be liable for any claim, damages, or other liability, whether in contract, tort, or otherwise, arising from, out of, or in connection with the use of this repository or the transactions you execute based on it.**
- By using these scripts, you acknowledge and agree that you are acting on your own responsibility and at your own risk.

### Introduction

These scripts are utilities for crafting raw transactions across multiple blockchain protocols. This repository provides templates to generate unsigned transactions for common operations (staking, unstaking, etc.). The transactions are returned in serialized form, and you are responsible for signing and broadcasting them yourself.

### ✅ Supported Protocols

- Cardano (ADA)
- Cosmos Hub (ATOM)
- Cronos (CRO)
- Polkadot (DOT)
- dYdX Chain (DYDX)
- Fetch.ai (FET)
- Hyperliquid (HYPE)
- Injective (INJ)
- Kava (KAVA)
- Kusama (KSM)
- Near (NEAR)
- Noble (NOBLE)
- MANTRA (OM)
- Osmosis (OSMO)
- Sei (SEI)
- Solana (SOL)
- Celestia (TIA)
- The Open Network (TON)
- Tron (TRX)
- Tezos (XTZ)
- ZetaChain (ZETA)

### 📦 Installation

- Prerequisite: [Bun](https://bun.sh/) installed on your system

```bash
# Clone the repository
git clone <repository-url>
cd unstake-scripts

# Install dependencies
bun install
```

### 🚀 Usage

Each protocol has its own service class. For example, to craft a stake transaction on Solana:

```ts
import SolService from "@/SOL/SolService";

async function main() {
  const service = new SolService();

  const tx = await service.craftStakeTx({
    wallet: "YourSolanaAddressHere",
    stake_account: "SolanaStakeAccountAddress",
    amount_lamports: "1000000000", // 1 SOL
  });

  console.log("Unsigned TX:", tx.unsigned_tx_serialized);
}

main();
```

The output is a serialized unsigned transaction string, which you can then sign with your preferred signing library or wallet.

#### Hyperliquid (HYPE)

Hyperliquid staking actions are not transactions but EIP-712 messages posted to the Hyperliquid API. Amounts are in wei (10^-8 HYPE).

```ts
import HypeService from "@/HYPE/HypeService";

const service = new HypeService(); // "mainnet" by default, or "testnet"

const tx = service.craftStakeTx({
  wallet: "0xYourHyperCoreAddress",
  validator_address: "0xValidatorAddress",
  amount_wei: "100000000", // 1 HYPE
});

// sign tx.typed_data (EIP-712), or tx.unsigned_tx_hash directly, then:
const { signed_tx_serialized } = await service.prepareTx({
  unsigned_tx_serialized: tx.unsigned_tx_serialized,
  signature: { r: "0x...", s: "0x...", v: 27 },
});
await service.broadcastTx(signed_tx_serialized);
```

Staking goes through `craftDepositTx` (spot → staking balance) then `craftStakeTx`; unstaking through `craftUnstakeTx`, then `craftWithdrawTx` (7-day queue), and `craftTransferToEvmTx` to move HYPE back to HyperEVM.

### 💻 Running from CLI

This repository includes a small example script you can run directly with Bun.
They are meant as templates — adapt them depending on the protocol and transaction type you want to craft.

For example, the provided example.ts shows how to call SolService.craftWithdrawStakeTx:

```bash
bun run src/example.ts SolWalletAddress SolStakeAccountAddress 1000000000
```

This will print the crafted unsigned Tron stake transaction.

### ✍️ Signing & 📡 Broadcasting (Out of Scope Here)

This repo does not sign or manage keys. Typical flow:

Sign unsigned_tx_serialized off-device or with your wallet/SDK.

Broadcast the signed transaction to the network.
