/********************************************************************
 * scripts/demo.ts – one-shot local-net demo for EconSight
 *   Run with:  tsx scripts/demo.ts
 *   Prereqs :  local validator running, program deployed,
 *              ANCHOR_WALLET env var pointing at your keypair
 *******************************************************************/
import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { execSync } from "node:child_process";

/* ---------- tiny helper ----------------------------------------- */
async function airdrop(conn: Connection, kp: Keypair, sol = 2): Promise<void> {
  const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}

/* ---------- connection / provider ------------------------------- */
const conn     = new Connection("http://127.0.0.1:8899", "confirmed");
const creator = anchor.Wallet.local().payer; 
await airdrop(conn, creator);

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(creator), {});
anchor.setProvider(provider);

const program = anchor.workspace.EconSightMarket as anchor.Program<any>;
const ix      = program.methods as any;   // single cast => easier TS

/* ---------- demo USDC mint -------------------------------------- */
const usdcMint = await createMint(conn, creator, creator.publicKey, null, 6);

/* ---------- PDAs ------------------------------------------------ */
const [marketPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("market"), creator.publicKey.toBuffer()],
  program.programId,
);
const [yesMint]  = PublicKey.findProgramAddressSync(
  [Buffer.from("yes_mint"), marketPda.toBuffer()],
  program.programId,
);
const [noMint]   = PublicKey.findProgramAddressSync(
  [Buffer.from("no_mint"), marketPda.toBuffer()],
  program.programId,
);
const [vault]    = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), marketPda.toBuffer()],
  program.programId,
);

/* ---------- create the market ---------------------------------- */
const question  = "If today were 1 July 2025, would ETH price be above $4 000? Answer YES or NO only.";
const expiryTs  = new BN(Math.floor(Date.now() / 1000) + 5); // +5 s
const feeBps    = 100;
const bScaled   = new BN(100_000_000);                        // bonding-curve param

await ix
  .createMarket(question, expiryTs, feeBps, creator.publicKey, bScaled)
  .accounts({
    market: marketPda,
    yesMint,
    noMint,
    vault,
    usdcMint,
    user: creator.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("✅ market created", marketPda.toBase58());

/* ---------- two demo traders ----------------------------------- */
const [traderA, traderB] = [Keypair.generate(), Keypair.generate()];
await Promise.all([airdrop(conn, traderA), airdrop(conn, traderB)]);

/* USDC accounts */
const traderAusdc = await getOrCreateAssociatedTokenAccount(
  conn, creator, usdcMint, traderA.publicKey,
);
const traderBusdc = await getOrCreateAssociatedTokenAccount(
  conn, creator, usdcMint, traderB.publicKey,
);
await mintTo(conn, creator, usdcMint, traderAusdc.address, creator, 1_000_000_000);
await mintTo(conn, creator, usdcMint, traderBusdc.address, creator, 1_000_000_000);

/* YES / NO accounts (important!) */
const traderAYes = await getOrCreateAssociatedTokenAccount(
  conn, traderA, yesMint, traderA.publicKey,
);
const traderBNo  = await getOrCreateAssociatedTokenAccount(
  conn, traderB, noMint,  traderB.publicKey,
);

/* each buys ~0.001 USDC of outcome-tokens */
const BUY = new BN(1_000);

await ix
  .buyOutcome({ yes: {} }, BUY)
  .accounts({
    market:             marketPda,
    userUsdcAccount:    traderAusdc.address,
    vault,
    treasuryAccount:    traderAusdc.address,   // demo – fees go back to trader
    userOutcomeAccount: traderAYes.address,    // ✅ YES ATA
    yesMint,
    noMint,
    user:               traderA.publicKey,
    tokenProgram:       TOKEN_PROGRAM_ID,
  })
  .signers([traderA])
  .rpc();

await ix
  .buyOutcome({ no: {} }, BUY)
  .accounts({
    market:             marketPda,
    userUsdcAccount:    traderBusdc.address,
    vault,
    treasuryAccount:    traderBusdc.address,
    userOutcomeAccount: traderBNo.address,     // ✅ NO ATA
    yesMint,
    noMint,
    user:               traderB.publicKey,
    tokenProgram:       TOKEN_PROGRAM_ID,
  })
  .signers([traderB])
  .rpc();

console.log("🤝 traders bought YES (A) / NO (B)");

/* ---------- wait, then resolve via oracle ----------------------- */
console.log("⏳ waiting 10 s for expiry…");
await new Promise(r => setTimeout(r, 10_000));

execSync(
  `npm --prefix "./oracle-bot" run oracle -- ${marketPda.toBase58()}`,
  { stdio: "inherit", env: process.env },
);

/* ---------- final balances ------------------------------------- */
const balA = (await conn.getTokenAccountBalance(traderAusdc.address)).value.uiAmount;
const balB = (await conn.getTokenAccountBalance(traderBusdc.address)).value.uiAmount;
console.log("\n💰 USDC balances after resolution");
console.log("   trader A (YES):", balA);
console.log("   trader B (NO) :", balB);

console.log("\n🎉 demo complete");
