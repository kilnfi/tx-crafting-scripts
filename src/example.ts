import SolService from '@/SOL/SolService';

async function main() {
  const service = new SolService();

  try {
    const result = await service.craftWithdrawStakeTx({
      wallet: process.argv[2],
      stake_account: process.argv[3],
      amount_lamports: process.argv[4],
    });

    console.log('Crafted stake tx:', result);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
