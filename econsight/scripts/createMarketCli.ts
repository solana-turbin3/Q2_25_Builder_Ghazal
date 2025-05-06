/**********************************************************************
 * scripts/createMarketCli.ts
 *********************************************************************/

import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { EconSightMarket } from "../target/types/econ_sight_market";

async function main() {
  /* ------------------------------------------------------------ */
  /* 0. Provider                                                  */
  /* ------------------------------------------------------------ */
  const connection = new anchor.web3.Connection(
    "http://127.0.0.1:8899",
    "confirmed"
  );
  const wallet    = anchor.Wallet.local();          // id.json
  anchor.setProvider(new anchor.AnchorProvider(connection, wallet, {}));

  /* ------------------------------------------------------------ */
  /* 1. Program                                                   */
  /* ------------------------------------------------------------ */
  const program = anchor.workspace
    .EconSightMarket as Program<EconSightMarket>;

  /* ------------------------------------------------------------ */
  /* 2. Fresh USDC-like mint                                      */
  /* ------------------------------------------------------------ */
  const usdcMint = await createMint(
    connection,
    wallet.payer,
    wallet.publicKey,
    null,
    6
  );

  /* ------------------------------------------------------------ */
  /* 3. PDAs                                                      */
  /* ------------------------------------------------------------ */
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

  /* treasury = wallet’s associated USDC account                  */
  const treasuryAcc = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    usdcMint,
    wallet.publicKey
  );
  const treasury = treasuryAcc.address;

  /* ------------------------------------------------------------ */
  /* 4. Create market                                             */
  /* ------------------------------------------------------------ */
  const question = "Will ETH > $4 000 on 1 July 2025?";
  const expiry   = new anchor.BN(Math.floor(Date.now() / 1000) + 30);
  const feeBps   = 100;
  const bScaled  = new anchor.BN(10_000_000);

  console.log("Derived PDAs");
  console.log("  market :", marketPda.toBase58());
  console.log("  yesMint:", yesMint.toBase58());
  console.log("  noMint :", noMint.toBase58());
  console.log("  vault  :", vault.toBase58());

  await program.methods
    .createMarket(question, expiry, feeBps, treasury, bScaled)
    .accounts({
      market: marketPda,
      yesMint,
      noMint,
      vault,
      usdcMint,
      user: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();

  /* ------------------------------------------------------------ */
  /* 5. Give the user 1 000 USDC                                  */
  /* ------------------------------------------------------------ */
  const userUsdcAcc = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    usdcMint,
    wallet.publicKey
  );

  await mintTo(
    connection,
    wallet.payer,
    usdcMint,
    userUsdcAcc.address,
    wallet.payer,
    1_000_000_000        // 1 000 USDC (6 dec)
  );

  console.log("\n✅ Market created!");
  console.log("   Market PDA :", marketPda.toBase58());
  console.log("   USDC mint  :", usdcMint.toBase58());
}

main().catch(err => (console.error(err), process.exit(1)));
