/// <reference types="mocha" />

// tests/econ_sight_market.ts
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import BN from "bn.js";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

import { EconSightMarket } from "../target/types/econ_sight_market";

describe("econ_sight_market – LMSR flow", () => {
  /* ── provider / program ─────────────────────────────────────── */
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace
    .EconSightMarket as Program<EconSightMarket>;
  const PROGRAM_ID = program.programId;

  async function fund(pk: PublicKey, sol = 2) {
    const sig = await connection.requestAirdrop(
      pk,
      sol * web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");
  }

  /* ── actors & PDAs ──────────────────────────────────────────── */
  const marketCreator = provider.wallet as anchor.Wallet;
  const userA = Keypair.generate();

  let marketPda: PublicKey;
  let vaultPda: PublicKey;
  let yesMintPda: PublicKey;
  let noMintPda: PublicKey;

  let usdcMint: PublicKey;
  let userAUsdc: PublicKey;
  let userAYes: PublicKey;
  let treasuryUsdc: PublicKey;

  /* ── global setup ───────────────────────────────────────────── */
  before(async () => {
    await fund(userA.publicKey, 2);

    /* in-memory USDC mint */
    usdcMint = await createMint(
      connection,
      marketCreator.payer,
      marketCreator.publicKey,
      null,
      6
    );

    /* USDC token accounts */
    userAUsdc = await createAccount(
      connection,
      marketCreator.payer,
      usdcMint,
      userA.publicKey
    );
    await mintTo(
      connection,
      marketCreator.payer,
      usdcMint,
      userAUsdc,
      marketCreator.payer,
      1_000_000_000
    );

    treasuryUsdc = await createAccount(
      connection,
      marketCreator.payer,
      usdcMint,
      marketCreator.publicKey
    );
    await mintTo(
      connection,
      marketCreator.payer,
      usdcMint,
      treasuryUsdc,
      marketCreator.payer,
      1_000_000_000
    );
  });

  /* ── Create Market ──────────────────────────────────────────── */
  it("creates a market", async () => {
    const question = "Will PMI ≥ 50 by Aug 1 2025?";
    const expiryTs = new BN(Math.floor(Date.now() / 1000) + 2);
    const feeBps   = 100;               // 1 %
    const bScaled  = new BN(10_000_000); // b = 10

    [marketPda] = await PublicKey.findProgramAddress(
      [Buffer.from("market"), marketCreator.publicKey.toBuffer()],
      PROGRAM_ID
    );
    [yesMintPda] = await PublicKey.findProgramAddress(
      [Buffer.from("yes_mint"), marketPda.toBuffer()],
      PROGRAM_ID
    );
    [noMintPda] = await PublicKey.findProgramAddress(
      [Buffer.from("no_mint"), marketPda.toBuffer()],
      PROGRAM_ID
    );
    [vaultPda] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), marketPda.toBuffer()],
      PROGRAM_ID
    );

    await program.methods
      .createMarket(question, expiryTs, feeBps, treasuryUsdc, bScaled)
      .accounts({
        market: marketPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        vault: vaultPda,
        usdcMint,
        user: marketCreator.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const m = await program.account.marketState.fetch(marketPda);
    assert.equal(Number(m.bValueScaled), 10_000_000, "b stored correctly");
  });

  /* ── Symmetric trades (100 YES, 100 NO) ─────────────────────── */
  it("symmetric trades leave vault solvent", async () => {
    const SHARES = new BN(100); // 100 YES vs 100 NO

    /* userA buys 100 YES */
    userAYes = await createAccount(
      connection, marketCreator.payer, yesMintPda, userA.publicKey
    );
    await program.methods
      .buyOutcome({ yes: {} }, SHARES)
      .accounts({
        market: marketPda,
        userUsdcAccount: userAUsdc,
        vault: vaultPda,
        treasuryAccount: treasuryUsdc,
        userOutcomeAccount: userAYes,
        yesMint: yesMintPda,
        noMint: noMintPda,
        user: userA.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([userA])
      .rpc();

    /* creator buys 100 NO */
    const creatorNo = await createAccount(
      connection, marketCreator.payer, noMintPda, marketCreator.publicKey
    );
    await program.methods
      .buyOutcome({ no: {} }, SHARES)
      .accounts({
        market: marketPda,
        userUsdcAccount: treasuryUsdc,
        vault: vaultPda,
        treasuryAccount: treasuryUsdc,
        userOutcomeAccount: creatorNo,
        yesMint: yesMintPda,
        noMint: noMintPda,
        user: marketCreator.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const vaultBal = (await getAccount(connection, vaultPda)).amount;
    assert.isAtLeast(Number(vaultBal), SHARES.toNumber(), "vault ≥ 100 µUSDC");
  });

  /* ── Resolve YES, winner profits ─────────────────────────────── */
  it("winner claims and profits", async () => {
    await new Promise((r) => setTimeout(r, 3000)); // wait past expiry

    await program.methods
      .resolveMarket({ yes: {} })
      .accounts({
        market: marketPda,
        authority: marketCreator.publicKey,
        oracleAuthority: marketCreator.publicKey,
      } as any)
      .rpc();

    const before = (await getAccount(connection, userAUsdc)).amount;

    await program.methods
      .claimRewards()
      .accounts({
        market: marketPda,
        vault: vaultPda,
        userOutcomeAccount: userAYes,
        userUsdcAccount:    userAUsdc,
        yesMint: yesMintPda,
        noMint:  noMintPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        user: userA.publicKey,
      } as any)
      .signers([userA])
      .rpc();

    const after = (await getAccount(connection, userAUsdc)).amount;
    assert.isAbove(Number(after), Number(before), "userA made a profit");
  });
});
