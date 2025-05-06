/**********************************************************************
 * oracle.ts – GPT oracle, manual enum tag, correct authority signer
 *
 * Usage: npm run oracle -- <MARKET_PDA>
 *********************************************************************/
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import crypto from "crypto";
import { OpenAI } from "openai";
import { Wallet } from "@coral-xyz/anchor";

/* ── CLI arg ────────────────────────────────────────────────────── */
const [marketStr] = process.argv.slice(2);
if (!marketStr) {
  console.error("Usage: oracle <MARKET_PDA>");
  process.exit(1);
}
const marketPk = new PublicKey(marketStr);

/* ── env constants ──────────────────────────────────────────────── */
const RPC_URL   = process.env.SOLANA_RPC  ?? "http://127.0.0.1:8899";
const PROGRAMID = new PublicKey(
  process.env.PROGRAM_ID ??
    "HNBosxTmZSjq7pwVEeqx5sEkAuwNroG2JWzvAnQYrRuy",
);

/* ---- load keypairs --------------------------------------------- */
function loadKey(pathOrJson: string | undefined): Keypair {
  if (!pathOrJson) throw new Error("Missing key env var");
  const txt = fs.existsSync(pathOrJson) ? fs.readFileSync(pathOrJson, "utf8") : pathOrJson;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(txt)));
}

const creatorKp = loadKey(process.env.CREATOR_KEY);                // authority
const oracleKp  = process.env.ORACLE_SECRET_KEY
  ? loadKey(process.env.ORACLE_SECRET_KEY)                         // oracle
  : creatorKp;                                                     // fallback

/* ---- connection & auto-airdrop --------------------------------- */
const conn = new Connection(RPC_URL, "confirmed");

for (const kp of [creatorKp, oracleKp]) {
  if ((await conn.getBalance(kp.publicKey)) === 0) {
    await conn.requestAirdrop(kp.publicKey, 1e9);
    await new Promise(r => setTimeout(r, 500));
  }
}

/* ── fetch question from account --------------------------------- */
const acct = await conn.getAccountInfo(marketPk);
if (!acct) throw new Error("Market account not found");
const disc = 8;
const strlen = acct.data.readUInt32LE(disc);
const question = acct.data.slice(disc + 4, disc + 4 + strlen).toString("utf8");
console.log("🛈  Market question:", question);

/* ── ask OpenAI --------------------------------------------------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const raw = (
  await openai.chat.completions.create({
    model: "o3",
    messages: [{ role: "user", content: `Answer exactly "YES" or "NO": ${question}` }],
  })
).choices[0].message?.content?.trim().toUpperCase() ?? "YES";

const answer = raw.startsWith("N") ? "NO" : "YES";
console.log("🤖  GPT says:", answer);

/* ── build instruction data manually ----------------------------- */
const discriminator = crypto
  .createHash("sha256")
  .update("global:resolve_market")
  .digest()
  .subarray(0, 8);                 // 8-byte discriminator

const tag = Buffer.from([answer === "YES" ? 0 : 1]);  // enum tag (0=Yes,1=No)
const data = Buffer.concat([discriminator, tag]);

/* accounts: must match Rust ResolveMarket struct order */
const keys = [
  { pubkey: marketPk,           isSigner: false, isWritable: true  },
  { pubkey: creatorKp.publicKey, isSigner: true, isWritable: false }, // authority
  { pubkey: oracleKp.publicKey,  isSigner: true, isWritable: false }, // oracle_authority
];

const ix = new TransactionInstruction({ programId: PROGRAMID, keys, data });

/* ── send tx ------------------------------------------------------ */
const tx = new Transaction().add(ix);
tx.feePayer = oracleKp.publicKey;                            // fee payer
tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
tx.sign(creatorKp, oracleKp);                                // BOTH sign

const sig = await conn.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: "confirmed",
});
await conn.confirmTransaction(sig, "confirmed");

console.log(`✅  Resolved as ${answer}\n   tx: ${sig}`);
