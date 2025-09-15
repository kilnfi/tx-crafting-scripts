import {
  type AccountInfo,
  Authorized,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  type ParsedAccountData,
  PublicKey,
  StakeProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  type VersionedTransactionResponse,
} from '@solana/web3.js';
import { getSimulationComputeUnits } from '@solana-developers/helpers';
import {
  CouldNotBroadcastTx,
  CouldNotCraftTx,
  CouldNotDecodeTx,
  CouldNotGetTxStatus,
  CouldNotPrepareTx,
  InsufficientBalanceError,
  invariant,
} from '@/errors/errors';
import {
  SolAmountLessThanMinimumDelegationError,
  SolFailedToEstimateGas,
  SolStakeAccountInsufficientBalanceError,
  SolStakeAccountNotFoundError,
  SolStakeAccountStillActiveError,
  SolWalletNotOwnerOfStakeAccountError,
} from '@/SOL/errors';
import type { SolanaTx } from '@/SOL/types';

export default class SolService {
  private readonly client;

  constructor() {
    this.client = new Connection(process.env.SOL_RPC_URL as string);
  }

  /**
   * Craft stake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftStakeTx({
    amount_lamports,
    vote_account_address,
    wallet,
    memo,
  }: {
    wallet: string;
    vote_account_address: string;
    amount_lamports: string;
    memo: string | null;
  }): Promise<SolanaTx & { public_key: string /* used to tag the stake in core-api */ }> {
    try {
      const tx = new Transaction();
      const wallet_pub_key = new PublicKey(wallet);
      const stake_key = new Keypair();
      const vote_pub_key = new PublicKey(vote_account_address);

      const balance = await this.client.getBalance(wallet_pub_key);

      const stake_instruction = StakeProgram.createAccount({
        fromPubkey: wallet_pub_key,
        authorized: new Authorized(wallet_pub_key, wallet_pub_key),
        lamports: Number(amount_lamports),
        stakePubkey: stake_key.publicKey,
      });

      // if the amount of lamports is smaller than the `rent exempt reserve` + `minimum delegation`
      // the transaction will fail with hard to understand error messages
      // refs:
      //  - https://github.com/solana-labs/solana/blob/27eff8408b7223bb3c4ab70523f8a8dca3ca6645/programs/stake/src/stake_state.rs#L147-L171
      //  - https://github.com/solana-labs/solana/blob/27eff8408b7223bb3c4ab70523f8a8dca3ca6645/programs/stake/src/stake_state.rs#L243-L295
      //  - https://github.com/solana-labs/solana/blob/27eff8408b7223bb3c4ab70523f8a8dca3ca6645/programs/stake/src/stake_state.rs#L875-L890
      const rent_exempt_reserve = await this.client.getMinimumBalanceForRentExemption(StakeProgram.space);
      const minimum_delegation = (await this.client.getStakeMinimumDelegation()).value;
      const minimum = rent_exempt_reserve + minimum_delegation;
      if (Number(amount_lamports) < minimum) {
        throw new SolAmountLessThanMinimumDelegationError(minimum);
      }
      if (balance - minimum < Number(amount_lamports)) {
        throw new InsufficientBalanceError(wallet, (balance - minimum).toString(), amount_lamports);
      }

      tx.add(
        stake_instruction,
        StakeProgram.delegate({
          stakePubkey: stake_key.publicKey,
          authorizedPubkey: wallet_pub_key,
          votePubkey: vote_pub_key,
        }),
      );

      if (memo) {
        tx.add(
          new TransactionInstruction({
            keys: [{ pubkey: wallet_pub_key, isSigner: true, isWritable: true }],
            data: Buffer.from(memo, 'utf-8'),
            programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
          }),
        );
      }

      const { blockhash } = await this.client.getLatestBlockhash();

      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet_pub_key;

      await this.addPriorityFeeInstructions(tx);

      tx.partialSign(stake_key);

      return {
        unsigned_tx_hash: tx.serializeMessage().toString('hex'),
        unsigned_tx_serialized: tx.serialize({ requireAllSignatures: false }).toString('hex'),
        unsigned_tx: tx.compileMessage(),
        public_key: stake_key.publicKey.toString(),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft deactivate stake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftDeactivateStakeTx({
    stake_account,
    wallet,
  }: {
    wallet: string;
    stake_account: string;
  }): Promise<SolanaTx> {
    try {
      const tx = new Transaction();
      const stake_account_pub_key = new PublicKey(stake_account);
      const wallet_pub_key = new PublicKey(wallet);

      const balance = await this.client.getBalance(wallet_pub_key);
      if (balance === 0) {
        throw new InsufficientBalanceError(wallet, balance.toString(), '>0');
      }

      // Check if the stake account exists
      if (!(await this.client.getAccountInfo(stake_account_pub_key))) {
        throw new SolStakeAccountNotFoundError(stake_account);
      }
      // Check if the wallet is the owner of the stake account
      if (!(await this.getStakeAccountsOfWallet(wallet_pub_key)).some((e) => e.pubkey.equals(stake_account_pub_key))) {
        throw new SolWalletNotOwnerOfStakeAccountError(wallet, stake_account);
      }

      tx.add(
        StakeProgram.deactivate({
          stakePubkey: stake_account_pub_key,
          authorizedPubkey: wallet_pub_key,
        }),
      );

      const { blockhash } = await this.client.getLatestBlockhash();

      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet_pub_key;

      await this.addPriorityFeeInstructions(tx);

      return {
        unsigned_tx_hash: tx.serializeMessage().toString('hex'),
        unsigned_tx_serialized: tx.serialize({ requireAllSignatures: false }).toString('hex'),
        unsigned_tx: tx.compileMessage(),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft withdraw stake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftWithdrawStakeTx({
    stake_account: stake_account_address,
    wallet,
    amount_lamports,
  }: {
    wallet: string;
    stake_account: string;
    amount_lamports: string | null;
  }): Promise<SolanaTx> {
    try {
      const wallet_pub_key = new PublicKey(wallet);
      const stake_account_pub_key = new PublicKey(stake_account_address);

      const balance = await this.client.getBalance(wallet_pub_key);
      if (balance === 0) {
        throw new InsufficientBalanceError(wallet, balance.toString(), '>0');
      }

      // Check if the stake account exists
      if (!(await this.client.getAccountInfo(stake_account_pub_key))) {
        throw new SolStakeAccountNotFoundError(stake_account_address);
      }

      const stake_accounts = await this.getStakeAccountsOfWallet(wallet_pub_key);
      // Check if the wallet is the owner of the stake account
      const stake_account = stake_accounts.find((e) => e.pubkey.equals(stake_account_pub_key));
      if (!stake_account) {
        throw new SolWalletNotOwnerOfStakeAccountError(wallet, stake_account_address);
      }

      const parsed_account = stake_account.account as AccountInfo<ParsedAccountData>;
      // grep these params on github to see the code
      const activationEpoch = Number(parsed_account.data.parsed.info.stake.delegation.activationEpoch);
      const deactivationEpoch = Number(parsed_account.data.parsed.info.stake.delegation.deactivationEpoch);

      const current_epoch = await this.client.getEpochInfo();

      const is_active =
        parsed_account.data.parsed.type === 'delegated' &&
        current_epoch.epoch >= activationEpoch + 1 &&
        deactivationEpoch > current_epoch.epoch;

      // Check if the stake account is still active
      if (is_active) {
        throw new SolStakeAccountStillActiveError(stake_account_address);
      }

      const withdrawable_balance = stake_account.account.lamports;

      if (withdrawable_balance < Number(amount_lamports)) {
        throw new SolStakeAccountInsufficientBalanceError(stake_account_address, withdrawable_balance.toString());
      }

      const amount = amount_lamports === null ? withdrawable_balance : Number(amount_lamports);

      const tx = new Transaction();

      tx.add(
        StakeProgram.withdraw({
          stakePubkey: stake_account_pub_key,
          authorizedPubkey: wallet_pub_key,
          toPubkey: wallet_pub_key,
          lamports: amount,
        }),
      );

      const { blockhash } = await this.client.getLatestBlockhash();

      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet_pub_key;

      await this.addPriorityFeeInstructions(tx);

      return {
        unsigned_tx_hash: tx.serializeMessage().toString('hex'),
        unsigned_tx_serialized: tx.serialize({ requireAllSignatures: false }).toString('hex'),
        unsigned_tx: tx.compileMessage(),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft split stake transaction
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftSplitStakeTx({
    amount_lamports,
    stake_account,
    wallet,
  }: {
    wallet: string;
    stake_account: string;
    amount_lamports: string;
  }): Promise<SolanaTx & { public_key: string /* used to tag the stake in core-api */ }> {
    try {
      const tx = new Transaction();
      const staker_pub_key = new PublicKey(wallet);
      const source_pub_key = new PublicKey(stake_account);
      const new_stake_account_pub_key = new Keypair();
      const minimumAmount = await this.client.getMinimumBalanceForRentExemption(StakeProgram.space);

      const balance = await this.client.getBalance(staker_pub_key);
      if (balance === 0) {
        throw new InsufficientBalanceError(wallet, balance.toString(), '>0');
      }

      tx.add(
        StakeProgram.split(
          {
            stakePubkey: source_pub_key,
            authorizedPubkey: staker_pub_key,
            splitStakePubkey: new_stake_account_pub_key.publicKey,
            lamports: Number(amount_lamports),
          },
          minimumAmount,
        ),
      );

      const { blockhash } = await this.client.getLatestBlockhash();

      tx.recentBlockhash = blockhash;
      tx.feePayer = staker_pub_key;

      await this.addPriorityFeeInstructions(tx);

      tx.partialSign(new_stake_account_pub_key);

      return {
        unsigned_tx_hash: tx.serializeMessage().toString('hex'),
        unsigned_tx_serialized: tx.serialize({ requireAllSignatures: false }).toString('hex'),
        unsigned_tx: tx.compileMessage(),
        public_key: new_stake_account_pub_key.publicKey.toString(),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**
   * Craft merge stakes transaction
   *
   * @see https://github.com/anza-xyz/agave/blob/bcc6b9532788a20eb7f441e2dbfc3c9a349a7705/sdk/program/src/stake/instruction.rs#L177-L201
   *
   * @throws {CouldNotCraftTx} if the transaction could not be crafted
   */
  public async craftMergeStakesTx({
    wallet,
    stake_account_destination,
    stake_account_source,
  }: {
    wallet: string;
    stake_account_source: string;
    stake_account_destination: string;
  }): Promise<SolanaTx> {
    try {
      const tx = new Transaction();
      const staker_pub_key = new PublicKey(wallet);
      const source_pub_key = new PublicKey(stake_account_source);
      const destination_pub_key = new PublicKey(stake_account_destination);

      const balance = await this.client.getBalance(staker_pub_key);
      if (balance === 0) {
        throw new InsufficientBalanceError(wallet, balance.toString(), '>0');
      }

      const stakes_of_wallet = await this.getStakeAccountsOfWallet(staker_pub_key);
      // Check if the wallet is the owner of the source stake account
      if (!stakes_of_wallet.some((e) => e.pubkey.equals(source_pub_key))) {
        throw new SolWalletNotOwnerOfStakeAccountError(wallet, stake_account_source);
      }
      // Check if the wallet is the owner of the destination stake account
      if (!stakes_of_wallet.some((e) => e.pubkey.equals(destination_pub_key))) {
        throw new SolWalletNotOwnerOfStakeAccountError(wallet, stake_account_destination);
      }

      tx.add(
        StakeProgram.merge({
          stakePubkey: destination_pub_key,
          sourceStakePubKey: source_pub_key,
          authorizedPubkey: staker_pub_key,
        }),
      );

      const { blockhash } = await this.client.getLatestBlockhash();

      tx.recentBlockhash = blockhash;
      tx.feePayer = staker_pub_key;

      await this.addPriorityFeeInstructions(tx);

      return {
        unsigned_tx_hash: tx.serializeMessage().toString('hex'),
        unsigned_tx_serialized: tx.serialize({ requireAllSignatures: false }).toString('hex'),
        unsigned_tx: tx.compileMessage(),
      };
    } catch (err) {
      throw new CouldNotCraftTx(err);
    }
  }

  /**r
   * Broadcasts a transaction
   *
   * @throws {CouldNotBroadcastTx} if the transaction could not be broadcasted
   */
  public async broadcastTx(tx_serialized: string): Promise<{ tx_hash: string }> {
    try {
      const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(tx_serialized, 'hex')));

      await this.client.simulateTransaction(tx);
      // const slot = await this.client.getSlot();
      const { blockhash, lastValidBlockHeight } = await this.client.getLatestBlockhash();

      // send after getting the nonce account and slot to avoid nonce errors
      const signature = await this.client.sendRawTransaction(tx.serialize());

      const res = await this.client.confirmTransaction(
        {
          signature,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
        },
        'confirmed',
      );
      if (res.value.err) {
        throw new Error(JSON.stringify(res.value.err));
      }
      return { tx_hash: signature };
    } catch (err) {
      throw new CouldNotBroadcastTx(err);
    }
  }

  /**
   * Prepare a transaction
   *
   * @throws {CouldNotPrepareTx} if the transaction could not be prepared
   */
  public async prepareTx({
    signatures,
    unsigned_tx_serialized,
  }: {
    unsigned_tx_serialized: string;
    signatures: string[];
  }): Promise<{ signed_tx_serialized: string }> {
    try {
      const tx = Transaction.from(Buffer.from(unsigned_tx_serialized, 'hex'));
      invariant(tx.feePayer, 'Could not find fee payer');

      for (const sig of signatures) {
        tx.addSignature(tx.feePayer, Buffer.from(sig, 'hex'));
      }

      if (tx.verifySignatures()) {
        return { signed_tx_serialized: tx.serialize().toString('hex') };
      }

      throw new Error('The transaction signatures could not be verified.');
    } catch (err) {
      throw new CouldNotPrepareTx(err);
    }
  }

  /**
   * Get the status of a transaction
   *
   * @throws {CouldNotGetTxStatus} if the transaction status could not be retrieved
   */
  public async txStatus(tx_hash: string): Promise<{
    status: 'success' | 'error';
    receipt: VersionedTransactionResponse | null;
  }> {
    try {
      const receipt = await this.client.getTransaction(tx_hash, {
        maxSupportedTransactionVersion: 0, // support legacy and new transactions https://solana.com/docs/advanced/versions#max-supported-transaction-version
      });
      const status = receipt?.meta?.err === null ? 'success' : 'error';
      return { status, receipt };
    } catch (err) {
      throw new CouldNotGetTxStatus(err);
    }
  }

  /**
   * Add a priority fee instruction that allows transactions to be broadcasted faster when network is congested
   *
   * ref: https://solana.com/developers/guides/advanced/how-to-use-priority-fees
   *
   * @throws {Error} if the fee payer is not present in the transaction
   * @throws {Error} if the compute unit limit could not be fetched
   */
  public async addPriorityFeeInstructions(tx: Transaction) {
    invariant(tx.feePayer, 'Could not find fee payer');

    const message = tx.compileMessage();

    // Get the recent prioritization fees for the affected accounts
    // ref: https://solana.com/developers/guides/advanced/how-to-use-priority-fees#how-do-i-estimate-priority-fees?
    const affected_accounts = message.staticAccountKeys.filter((_, i) => message.isAccountWritable(i));
    const recent_fees = await this.client.getRecentPrioritizationFees({
      lockedWritableAccounts: affected_accounts,
    });

    const sorted_fees_desc = recent_fees.map((e) => e.prioritizationFee).sort((a, b) => a - b);
    // take the 25th percentile fee
    const max_prioritization_fee = sorted_fees_desc[Math.floor(sorted_fees_desc.length / 25)];

    try {
      // get the compute unit limit
      const compute_unit_limit = await getSimulationComputeUnits(this.client, tx.instructions, tx.feePayer, []);
      invariant(compute_unit_limit, 'Could not get compute unit limit');

      tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units:
            // increase the compute unit limit by 20%
            // ref: https://solana.com/developers/guides/advanced/how-to-request-optimal-compute#special-considerations-1
            (compute_unit_limit * 120) / 100,
        }),
      );
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: max_prioritization_fee,
        }),
      );
    } catch (err) {
      throw new SolFailedToEstimateGas(err);
    }
  }

  /**
   * Decode a transaction
   *
   * @throws {CouldNotDecodeTx} if the transaction could not be decoded
   */
  public async decodeTx(tx_serialized: string): Promise<Transaction> {
    try {
      return Transaction.from(Buffer.from(tx_serialized, 'hex'));
    } catch (err) {
      throw new CouldNotDecodeTx(err);
    }
  }

  /**
   * Get the stake accounf of a wallet,
   * used to check the ownership of the stake accounts
   *
   * ref: https://solanacookbook.com/references/staking.html#get-stake-amount
   */
  protected async getStakeAccountsOfWallet(wallet: PublicKey) {
    const stake_accounts = await this.client.getParsedProgramAccounts(StakeProgram.programId, {
      filters: [
        { dataSize: StakeProgram.space },
        {
          memcmp: {
            offset: 12,
            bytes: wallet.toBase58(),
          },
        },
      ],
    });

    return stake_accounts;
  }
}
