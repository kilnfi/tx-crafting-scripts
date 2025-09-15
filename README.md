# Transactions crafting scripts

# Disclaimer

⚠️ Kiln is a non-custodial staking provider. As a customer and owner of your assets, **it is YOUR responsibility to check and verify all the transactions you are signing**. While Kiln provides tooling to help you interact with your stakes (web applications, APIs, scripts), **Kiln is never responsible for the transactions that you sign.**

Scripts and utilities for crafting raw transactions across multiple blockchain protocols. This repository provides helpers to generate unsigned transactions for common operations (staking, unstaking, etc.). The transactions are returned in serialized form, and you are responsible for signing and broadcasting them yourself.

### ✅ Supported Protocols

- Cosmos Hub (ATOM)
- Cronos (CRO)
- Polkadot (DOT)
- dYdX Chain (DYDX)
- Fetch.ai (FET)
- Injective (INJ)
- Kava (KAVA)
- Kusama (KSM)
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

Each protocol has its own service class. For example, to craft a withdraw transaction on Solana:

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

## Legal disclaimer

THIS CODE IS PROVIDED "AS IS," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN
CONNECTION WITH THE CODE OR THE USE OR OTHER DEALINGS IN THE CODE.
