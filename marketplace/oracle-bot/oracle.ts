
import * as anchor from "@coral-xyz/anchor";
import type { Program as AnchorProgram } from "@coral-xyz/anchor";

import "dotenv/config";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import anchorPkg from "@coral-xyz/anchor";        // ← CommonJS default import
import { OpenAI } from "openai";
import type { EconSightMarket } from "../target/types/econ_sight_market";

/* JSON IDL – use CommonJS require so Node doesn't need import attributes */
const idl = require("../target/idl/econ_sight_market.json");

const {
  AnchorProvider,
  Program,
  Wallet,
  web3,
} = require("@coral-xyz/anchor") as typeof import("@coral-xyz/anchor");
async function main() {
  /* 0. CLI arg ------------------------------------------------------ */
  if (process.argv.length < 3) {
    console.error("Usage: ts-node oracle.ts EWZiNfxspaXR9uc3ZAu1t2GvCyT2q4xPjht52aMKXVzo");
    process.exit(1);
  }
  const marketPda = new PublicKey(process.argv[2]);

  /* 1. RPC & oracle keypair ---------------------------------------- */
  const conn = new Connection(process.env.SOLANA_RPC!, "confirmed");
  const oracleKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.ORACLE_SECRET_KEY!))
  );

  const provider = new AnchorProvider(
    conn,
    {
      publicKey: oracleKp.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.partialSign(oracleKp);
        return tx;
      },
      signAllTransactions: async (txs: Transaction[]) =>
        txs.map(t => (t.partialSign(oracleKp), t)),
    } as any,
    {}
  );

  
  const programId = new PublicKey(process.env.PROGRAM_ID!);
  const program   = new (Program as any)(
    idl,              
    provider,         
    programId         
  ) as AnchorProgram<EconSightMarket>;
  
  console.log("Account namespaces in oracle-bot:", Object.keys(program.account));

  
  const marketAcc = await program.account.marketState.fetch(marketPda);
  if (marketAcc.resolved) {
    console.log("Market already resolved:", marketPda.toBase58());
    return;
  }


  const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `Answer exactly "YES" or "NO".\nQuestion: ${marketAcc.question}`;

  const chat = await ai.chat.completions.create({
    model: "o3",
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (chat.choices[0].message?.content ?? "").trim().toUpperCase();
  const answer = raw.startsWith("Y") ? "YES" : "NO";
  const winnerSide = answer === "YES" ? { yes: {} } : { no: {} };

  console.log("GPT answer:", answer);

  /* 5. Resolve on-chain -------------------------------------------- */
  await program.methods
    .resolveMarket(winnerSide)
    .accounts({
      market: marketPda,
      authority: oracleKp.publicKey,
      oracleAuthority: oracleKp.publicKey,
    } as any)
    .signers([oracleKp])
    .rpc();

  console.log("✓ Resolved", marketPda.toBase58(), "as", answer);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
