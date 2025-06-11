import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

/* ------------------------------------------------------- */
/*  configuration                                          */
/* ------------------------------------------------------- */
const SEED       = 42;
const FEE_BPS    = 10;       // 0.10 %
const LP_TOKENS  = 1_000;
const MAX_X      = 500_000;
const MAX_Y      = 250_000;
const SWAP_IN    = 10;       // trader swaps 10 X → Y
const MIN_OUT    = 0;        // no slippage guard for demo
const X_TO_Y     = true;
const LP_AMOUNT = 100;
const MIN_X=10;
const MIN_Y=10;

/* ------------------------------------------------------- */
/*  actors (keypairs)                                      */
/* ------------------------------------------------------- */
const admin   = Keypair.generate();   // initialize
const lp      = Keypair.generate();   // deposit
const trader  = Keypair.generate();   // swap

/* ──────────────────────────────────────────────────────── */
describe("AMM – happy path", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AMM as anchor.Program;

  /* on-chain addresses filled throughout the test */
  let mintX: PublicKey, mintY: PublicKey, mintLp: PublicKey;
  let configPda: PublicKey;
  let vaultX: PublicKey, vaultY: PublicKey;
  let lpX: PublicKey, lpY: PublicKey, lpLp: PublicKey;
  let traderX: PublicKey, traderY: PublicKey;

  /* ----------------------------------------------------- */
  before("airdrop & set up mints / ATAs", async () => {
    /* airdrop 2 SOL to every signer */
    for (const kp of [admin, lp, trader]) {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(
          kp.publicKey,
          2 * anchor.web3.LAMPORTS_PER_SOL
        )
      );
    }

    /* helper to create a 6-dec SPL mint with payer = wallet */
    const newMint = () =>
      createMint(
        provider.connection,
        provider.wallet.payer!,
        provider.wallet.payer!.publicKey,
        null,
        6
      );

    mintX = await newMint();
    mintY = await newMint();

    /* LP’s token accounts (will deposit) */
    lpX = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer!,
      mintX,
      lp.publicKey
    )).address;

    lpY = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer!,
      mintY,
      lp.publicKey
    )).address;

    /* fund LP with plenty of X & Y */
    await mintTo(
      provider.connection,
      provider.wallet.payer!,
      mintX,
      lpX,
      provider.wallet.payer!,
      1_000_000
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer!,
      mintY,
      lpY,
      provider.wallet.payer!,
      1_000_000
    );

    /* Trader’s token accounts */
    traderX = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer!,
      mintX,
      trader.publicKey
    )).address;

    traderY = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer!,
      mintY,
      trader.publicKey
    )).address;

    /* fund trader with X for the swap */
    await mintTo(
      provider.connection,
      provider.wallet.payer!,
      mintX,
      traderX,
      provider.wallet.payer!,
      1_000
    );
  });

  /* ----------------------------------------------------- */
  it("initializes pool", async () => {
    /* derive PDAs */
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), new BN(SEED).toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [mintLp] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), configPda.toBuffer()],
      program.programId
    );

    /* vault addresses (ATAs owned by config PDA) */
    vaultX = getAssociatedTokenAddressSync(mintX, configPda, true);
    vaultY = getAssociatedTokenAddressSync(mintY, configPda, true);
    /* LP’s future LP-token ATA (created by deposit) */
    lpLp   = getAssociatedTokenAddressSync(mintLp, lp.publicKey);

    await program.methods
      .initialize(new BN(SEED), FEE_BPS, admin.publicKey)
      .accounts({
        initializer: admin.publicKey,
        mintX,
        mintY,
        mintLp,
        vaultX,
        vaultY,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    /* sanity assert */
    const cfg: any = await (program as any).account["config"].fetch(configPda);
    assert.equal(cfg.fees, FEE_BPS);
    assert.equal(cfg.mintX.toBase58(), mintX.toBase58());
  });

  /* ----------------------------------------------------- */
  it("deposits LP", async () => {
    await program.methods
      .deposit(new BN(LP_TOKENS), new BN(MAX_X), new BN(MAX_Y))
      .accounts({
        user: lp.publicKey,
        mintX,
        mintY,
        mintLp,
        vaultX,
        vaultY,
        userX: lpX,
        userY: lpY,
        config: configPda,
        userLp: lpLp,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lp])
      .rpc();

    const lpBal = await getAccount(provider.connection, lpLp);
    assert.equal(Number(lpBal.amount), LP_TOKENS, "LP tokens minted");
  });

  /* ----------------------------------------------------- */
  it("swaps tokens", async () => {
    await program.methods
      .swap(new BN(SWAP_IN), new BN(MIN_OUT), X_TO_Y)
      .accounts({
        user: trader.publicKey,
        config: configPda,
        mintX,
        mintY,
        mintLp,
        vaultX,
        vaultY,
        userX: lpX,
        userY: lpY,
        userLp: lpLp,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    /* very small assertion: trader’s Y balance increased */
    const yAfter = await getAccount(provider.connection, traderY);
    assert.ok(Number(yAfter.amount) > 0, "trader received Y");
  });
   /* ----------------------------------------------------- */
  it("withdraws", async () => {
    await program.methods
      .swap(new BN(LP_AMOUNT), new BN(MIN_X), new Number(MIN_Y))
      .accounts({
        user: lp.publicKey,
        mintX,
        mintY,
        vaultX,
        vaultY,
        userX: traderX,
        userY: traderY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    /* very small assertion: trader’s Y balance increased */
    const yAfter = await getAccount(provider.connection, traderY);
    assert.ok(Number(yAfter.amount) > 0, "trader received Y");
  });
});