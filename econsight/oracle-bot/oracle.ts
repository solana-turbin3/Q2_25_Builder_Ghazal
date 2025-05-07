/**********************************************************************
 * oracle-bot/oracle.ts  – GPT oracle for EconSight (ESM / top‑level await)
 *
 *   Usage:  npm run oracle -- <MARKET_PDA>
 *   Env:    SOLANA_RPC           (default http://127.0.0.1:8899)
 *           PROGRAM_ID           (optional – otherwise read from Anchor.toml)
 *           SOLANA_CLUSTER       (localnet | devnet | mainnet; default localnet)
 *           CREATOR_KEY          (file path or raw JSON; falls back to ORACLE_SECRET_KEY)
 *           ORACLE_SECRET_KEY    (file path or raw JSON – signs tx)
 *           OPENAI_API_KEY
 *********************************************************************/
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { parse as parseToml } from "@iarna/toml";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { OpenAI } from "openai";

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */
function loadKey(source: string): Keypair {
  const txt = fs.existsSync(source) ? fs.readFileSync(source, "utf8") : source;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(txt)));
}

function findAnchorToml(start = process.cwd()): string {
  let dir = path.resolve(start);
  while (!fs.existsSync(path.join(dir, "Anchor.toml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Anchor.toml not found");
    dir = parent;
  }
  return path.join(dir, "Anchor.toml");
}

function programIdFromToml(cluster: string): PublicKey {
  const doc = parseToml(fs.readFileSync(findAnchorToml(), "utf8")) as any;
  /*  👇🏻 cast once – avoids the implicit‑any warning */
  const pidStr =
    (doc.programs as Record<string, Record<string, string>>)[cluster]
      ?.econ_sight_market;
  if (!pidStr) throw new Error(`No program ID for [programs.${cluster}]`);
  return new PublicKey(pidStr);
}

/* ------------------------------------------------------------------ */
/*  CLI arg – which market to resolve                                 */
/* ------------------------------------------------------------------ */
const [marketStr] = process.argv.slice(2);
if (!marketStr) {
  console.error("Usage: npm run oracle -- <MARKET_PDA>");
  process.exit(1);
}
const marketPk = new PublicKey(marketStr);

/* ------------------------------------------------------------------ */
/*  environment & connections                                         */
/* ------------------------------------------------------------------ */
const RPC_URL   = process.env.SOLANA_RPC ?? "http://127.0.0.1:8899";
const CLUSTER   = process.env.SOLANA_CLUSTER ?? "localnet";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID ?? programIdFromToml(CLUSTER)
);

const oracleKp = loadKey(
  process.env.ORACLE_SECRET_KEY ??
  (() => { throw new Error("Missing ORACLE_SECRET_KEY"); })()
);

const creatorKp = loadKey(process.env.CREATOR_KEY ?? process.env.ORACLE_SECRET_KEY!);

const conn = new Connection(RPC_URL, "confirmed");

/* ------------------------------------------------------------------ */
/*  read the market account – verify authority                        */
/* ------------------------------------------------------------------ */
const acct = await conn.getAccountInfo(marketPk);
if (!acct) throw new Error("Market account not found on RPC");

const disc        = 8;
const strLen      = acct.data.readUInt32LE(disc);
const afterStr    = disc + 4 + strLen;
const afterTs     = afterStr + 8;            // i64 expiry
const afterPk3    = afterTs + 32 * 3;        // yesMint + noMint + vault
const authorityPk = new PublicKey(acct.data.slice(afterPk3, afterPk3 + 32));

if (!authorityPk.equals(creatorKp.publicKey)) {
  throw new Error(
    `Creator key mismatch.\n` +
    `• market.authority : ${authorityPk.toBase58()}\n` +
    `• CREATOR_KEY      : ${creatorKp.publicKey.toBase58()}`
  );
}

/* pull the question (nice to log) */
const question = acct.data.slice(disc + 4, disc + 4 + strLen).toString("utf8");
console.log("🛈 question:", question);

/* ------------------------------------------------------------------ */
/*  ask GPT – unary YES | NO                                          */
/* ------------------------------------------------------------------ */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const raw = (
  await openai.chat.completions.create({
    model: "o3",
    messages: [{ role: "user", content: `Answer exactly "YES" or "NO": ${question}` }],
  })
).choices?.[0]?.message?.content?.trim().toUpperCase() ?? "YES";

const pick = raw.startsWith("N") ? "NO" : "YES";
if (raw !== "YES" && raw !== "NO") {
  console.warn("⚠️ GPT returned:", raw, "→ treating as", pick);
} else {
  console.log("🤖 GPT says:", pick);
}

/* ------------------------------------------------------------------ */
/*  craft & send resolve_market instruction                           */
/* ------------------------------------------------------------------ */
const discriminator = crypto.createHash("sha256")
  .update("global:resolve_market")
  .digest()
  .subarray(0, 8);

const data = Buffer.concat([
  discriminator,
  Buffer.from([pick === "YES" ? 0 : 1])       // enum tag
]);

const keys = [
  { pubkey: marketPk,            isSigner: false, isWritable: true  },
  { pubkey: creatorKp.publicKey, isSigner: true,  isWritable: false }, // authority
  { pubkey: oracleKp.publicKey,  isSigner: true,  isWritable: false }, // oracle_authority
];

const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
const tx = new Transaction().add(ix);
tx.feePayer = oracleKp.publicKey;
tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
tx.sign(creatorKp, oracleKp);

const sig = await conn.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: "confirmed",
});
await conn.confirmTransaction(sig, "confirmed");
console.log(`✅ resolved ${pick}  tx: ${sig}`);
