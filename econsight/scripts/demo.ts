/********************************************************************
 * scripts/demo.ts  –  full market life-cycle demo on localnet
 *******************************************************************/
import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
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
} from "@solana/web3.js";
import type { EconSightMarket } from "../target/types/econ_sight_market";

// ── import oracle helper (must export resolveWithGPT in oracle.ts)
import { resolveWithGPT } from "../oracle-bot/oracle";

/* ---------------------------------------------------------------- */
/* 0. Provider                                                      */
/* ---------------------------------------------------------------- */
const conn = new Connection("http://127.0.0.1:8899", "confirmed");
const wallet = anchor.Wallet.local(); // ~/.config/solana/id.json
anchor.setProvider(new anchor.AnchorProvider(conn, wallet, {}));

/* ---------------------------------------------------------------- */
/* 1. Program handle                                                */
/* ---------------------------------------------------------------- */
const program = anchor.workspace
  .EconSightMarket as anchor.Program<EconSightMarket>;

/* ---------------------------------------------------------------- */
/* 2. USDC demo mint                                                */
/* ---------------------------------------------------------------- */
const usdcMint = await createMint(
  conn,
  wallet.payer,
  wallet.publicKey,
  null,
  6 /* decimals */
);

/* ---------------------------------------------------------------- */
/* 3. Derive PDAs                                                   */
/* ---------------------------------------------------------------- */
const [marketPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("market"), wallet.publicKey.toBuffer()],
  program.programId
);
const [yesMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("yes_mint"), marketPda.toBuffer()],
  program.programId
);
const [noMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("no_mint"), marketPda.toBuffer()],
  program.programId
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), marketPda.toBuffer()],
  program.programId
);

/* ---------------------------------------------------------------- */
/* 4. Create the market                                             */
/* ---------------------------------------------------------------- */
const question = "Will ETH > $4 000 on 1 July 2025?";
const expiryTs = new anchor.BN(Math.floor(Date.now() / 1000) + 60); // 1 min
const feeBps = 100;                     // 1 %
const bScaled = new anchor.BN(10_000_000);

await program.methods
  .createMarket(question, expiryTs, feeBps, wallet.publicKey, bScaled)
  .accounts({
    market: marketPda,
    yesMint,
    noMint,
    vault,
    usdcMint,
    user: wallet.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();

console.log("✅ Market created:", marketPda.toBase58());

/* ---------------------------------------------------------------- */
/* 5. Fund two demo traders with USDC                               */
/* ---------------------------------------------------------------- */
const traderA = Keypair.generate();
const traderB = Keypair.generate();
await conn.requestAirdrop(traderA.publicKey, 2e9);
await conn.requestAirdrop(traderB.publicKey, 2e9);

const traderAusdc = await getOrCreateAssociatedTokenAccount(
  conn,
  wallet.payer,
  usdcMint,
  traderA.publicKey
);
const traderBusdc = await getOrCreateAssociatedTokenAccount(
  conn,
  wallet.payer,
  usdcMint,
  traderB.publicKey
);
await mintTo(conn, wallet.payer, usdcMint, traderAusdc.address, wallet.payer, 1_000_000_000);
await mintTo(conn, wallet.payer, usdcMint, traderBusdc.address, wallet.payer, 1_000_000_000);

/* ---------------------------------------------------------------- */
/* 6. Traders buy YES / NO (simplified – real code would derive ATA)*/
/* ---------------------------------------------------------------- */
// … add purchase instructions here if you want a visual trade step …

/* ---------------------------------------------------------------- */
/* 7. Resolve with GPT oracle                                       */
/* ---------------------------------------------------------------- */
await resolveWithGPT(marketPda.toBase58());

console.log("🎉 Demo complete");
