/********************************************************************
 * scripts/demo.ts – one-shot local-net demo for EconSight
 *   Run with:  tsx scripts/demo.ts
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

/* ---------- helpers -------------------------------------------- */
async function airdrop(conn: Connection, kp: Keypair, sol = 2) {
  const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}
function uiNum(n: number | string | null | undefined): number {
  return typeof n === "number" ? n : Number(n ?? "0");
}
async function tokenBalance(conn: Connection, addr: PublicKey) {
  const bal = await conn.getTokenAccountBalance(addr);
  return uiNum(bal.value.uiAmount ?? bal.value.uiAmountString);
}

/* ---------- connection / provider ------------------------------ */
const conn    = new Connection("http://127.0.0.1:8899", "confirmed");
const creator = anchor.Wallet.local().payer;
await airdrop(conn, creator);

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(creator), {});
anchor.setProvider(provider);

const program = anchor.workspace.EconSightMarket as anchor.Program<any>;
const ix      = program.methods as any;

/* ---------- demo USDC mint ------------------------------------- */
const usdcMint = await createMint(conn, creator, creator.publicKey, null, 6);

/* ---------- PDAs ------------------------------------------------ */
const [marketPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("market"), creator.publicKey.toBuffer()],
  program.programId,
);
const [yesMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("yes_mint"), marketPda.toBuffer()],
  program.programId,
);
const [noMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("no_mint"), marketPda.toBuffer()],
  program.programId,
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), marketPda.toBuffer()],
  program.programId,
);

/* ---------- market parameters ---------------------------------- */
const feeBps  = 20;                    // 0.20 %
const bScaled = new BN(1_000_000_000); // b = 1 000
const BUY_YES = new BN(500_000);       // 0.5  USDC face value
const BUY_NO  = new BN(500_000);       // 0.5  USDC face value

/* ---------- create the market ---------------------------------- */
const question =
  "Answer YES or NO only—no other words, symbols, or punctuation: If today were 1 July 2025, would ETH be above $4 000?";
const expiryTs = new BN(Math.floor(Date.now() / 1000) + 5); // +5 s

await ix
  .createMarket(question, expiryTs, feeBps, creator.publicKey, bScaled)
  .accounts({
    market: marketPda,
    yesMint,
    noMint,
    vault,
    usdcMint,
    user:          creator.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram:  TOKEN_PROGRAM_ID,
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
await mintTo(conn, creator, usdcMint, traderAusdc.address, creator, 2_000_000_000);
await mintTo(conn, creator, usdcMint, traderBusdc.address, creator, 2_000_000_000);

/* YES / NO ATAs */
const traderAYes = await getOrCreateAssociatedTokenAccount(conn, traderA, yesMint, traderA.publicKey);
const traderBNo  = await getOrCreateAssociatedTokenAccount(conn, traderB, noMint,  traderB.publicKey);

/* ---------- Trader A buys YES ---------------------------------- */
await ix
  .buyOutcome({ yes: {} }, BUY_YES)
  .accounts({
    market:             marketPda,
    userUsdcAccount:    traderAusdc.address,
    vault,
    treasuryAccount:    traderAusdc.address,
    userOutcomeAccount: traderAYes.address,
    yesMint,
    noMint,
    user:               traderA.publicKey,
    tokenProgram:       TOKEN_PROGRAM_ID,
  })
  .signers([traderA])
  .rpc();

/* ---------- Trader B buys NO ----------------------------------- */
await ix
  .buyOutcome({ no: {} }, BUY_NO)
  .accounts({
    market:             marketPda,
    userUsdcAccount:    traderBusdc.address,
    vault,
    treasuryAccount:    traderBusdc.address,
    userOutcomeAccount: traderBNo.address,
    yesMint,
    noMint,
    user:               traderB.publicKey,
    tokenProgram:       TOKEN_PROGRAM_ID,
  })
  .signers([traderB])
  .rpc();

/* ---------- log what each paid --------------------------------- */
const costPaidA = await tokenBalance(conn, traderAYes.address);
const costPaidB = await tokenBalance(conn, traderBNo.address);

console.log("🤝 traders bought YES (A) / NO (B)");
console.log(`   → Trader A paid ${costPaidA.toFixed(9)} USDC, Trader B paid ${costPaidB.toFixed(9)} USDC`);

/* ---------- wait, then resolve via oracle ----------------------- */
console.log("⏳ waiting 10 s for expiry…");
await new Promise(r => setTimeout(r, 10_000));

execSync(`npm --prefix "./oracle-bot" run oracle -- ${marketPda.toBase58()}`, {
  stdio: "inherit",
  env: process.env,
});

/* ---------- balances BEFORE claiming --------------------------- */
const balABefore = await tokenBalance(conn, traderAusdc.address);
const balBBefore = await tokenBalance(conn, traderBusdc.address);

/* ---------- fetch market, determine winner --------------------- */
const marketAcc: any = await (program.account as any).marketState.fetch(marketPda);
const yesWins = marketAcc.winner && "yes" in marketAcc.winner;

/* ---------- claim rewards -------------------------------------- */
if (yesWins) {
  await ix
    .claimRewards()
    .accounts({
      market:             marketPda,
      vault,
      userOutcomeAccount: traderAYes.address,
      userUsdcAccount:    traderAusdc.address,
      yesMint,
      noMint,
      tokenProgram:       TOKEN_PROGRAM_ID,
      user:               traderA.publicKey,
    })
    .signers([traderA])
    .rpc();
} else {
  await ix
    .claimRewards()
    .accounts({
      market:             marketPda,
      vault,
      userOutcomeAccount: traderBNo.address,
      userUsdcAccount:    traderBusdc.address,
      yesMint,
      noMint,
      tokenProgram:       TOKEN_PROGRAM_ID,
      user:               traderB.publicKey,
    })
    .signers([traderB])
    .rpc();
}

/* ---------- final balances & rewards --------------------------- */
const balAFinal = await tokenBalance(conn, traderAusdc.address);
const balBFinal = await tokenBalance(conn, traderBusdc.address);
const rewardA   = balAFinal - balABefore;
const rewardB   = balBFinal - balBBefore;

/* ---------- report --------------------------------------------- */
console.log("\n📊 LMSR summary (USDC)");
console.log(`   Trader A paid   : ${costPaidA.toFixed(9)}`);
console.log(`   Trader A reward : ${rewardA.toFixed(9)}`);
console.log(`   Trader B paid   : ${costPaidB.toFixed(9)}`);
console.log(`   Trader B reward : ${rewardB.toFixed(9)}`);

console.log("\n💰 USDC balances after claim");
console.log("   trader A (YES):", balAFinal);
console.log("   trader B (NO) :", balBFinal);

console.log("\n🎉 demo complete");