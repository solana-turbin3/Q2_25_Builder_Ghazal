/**********************************************************************
 * oracle-bot/oracle.ts – GPT oracle for EconSight (ESM / top-level await)
 *********************************************************************/
import "dotenv/config";
import fs from "fs";
import path from "path";
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

/* ---------- helpers -------------------------------------------- */
function loadKey(src: string): Keypair {
  const txt = fs.existsSync(src) ? fs.readFileSync(src, "utf8") : src;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(txt)));
}
function findAnchorToml(start = process.cwd()): string {
  let dir = path.resolve(start);
  while (!fs.existsSync(path.join(dir, "Anchor.toml"))) {
    const p = path.dirname(dir);
    if (p === dir) throw new Error("Anchor.toml not found");
    dir = p;
  }
  return path.join(dir, "Anchor.toml");
}
function programIdFromToml(cluster: string): PublicKey {
  const doc = parseToml(fs.readFileSync(findAnchorToml(), "utf8")) as any;
  const pid = (doc.programs as Record<string, Record<string, string>>)[cluster]
    ?.econ_sight_market;
  if (!pid) throw new Error(`No program ID for [programs.${cluster}]`);
  return new PublicKey(pid);
}

/* ---------- CLI arg -------------------------------------------- */
const [marketStr] = process.argv.slice(2);
if (!marketStr) {
  console.error("Usage: npm run oracle -- <MARKET_PDA>");
  process.exit(1);
}
const marketPk = new PublicKey(marketStr);

/* ---------- env / conn ----------------------------------------- */
const RPC_URL = process.env.SOLANA_RPC ?? "http://127.0.0.1:8899";
const CLUSTER = process.env.SOLANA_CLUSTER ?? "localnet";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID ?? programIdFromToml(CLUSTER),
);

const oracleKp  = loadKey(process.env.ORACLE_SECRET_KEY!);
const creatorKp = loadKey(process.env.CREATOR_KEY ?? process.env.ORACLE_SECRET_KEY!);

const conn = new Connection(RPC_URL, "confirmed");

/* ---------- read market ---------------------------------------- */
const acct = await conn.getAccountInfo(marketPk);
if (!acct) throw new Error("Market account not found on RPC");

const disc     = 8;
const strLen   = acct.data.readUInt32LE(disc);
const question = acct.data.slice(disc + 4, disc + 4 + strLen).toString("utf8");
console.log("🛈 question:", question);

const afterPk3 = disc + 4 + strLen + 8 + 32 * 3;
const authorityPk = new PublicKey(acct.data.slice(afterPk3, afterPk3 + 32));
if (!authorityPk.equals(creatorKp.publicKey)) throw new Error("Creator key mismatch");

/* ---------- ask o3 with web search ----------------------------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// @ts-ignore – web_search is supported by o3 even though not in typings
const chatRes = await openai.chat.completions.create({
  model: "o3",
  messages: [
    {
      role: "system",
      content:
             'Answer **exactly** "YES" or "NO" (no extra words). If information is missing, search the web silently first, then answer.'
    },
    { role: "user", content: question },
  ],
});

const raw  = chatRes.choices?.[0]?.message?.content?.trim().toUpperCase() ?? "YES";
const pick = raw.startsWith("N") ? "NO" : "YES";
if (raw !== "YES" && raw !== "NO") {
  console.warn("⚠️ GPT returned:", raw, "→ treating as", pick);
} else {
  console.log("🤖 GPT says:", pick);
}

/* ---------- send resolve_market -------------------------------- */
const discriminator = crypto.createHash("sha256")
  .update("global:resolve_market")
  .digest()
  .subarray(0, 8);

const data = Buffer.concat([
  discriminator,
  Buffer.from([pick === "YES" ? 0 : 1]),
]);

const keys = [
  { pubkey: marketPk,            isSigner: false, isWritable: true },
  { pubkey: creatorKp.publicKey, isSigner: true,  isWritable: false },
  { pubkey: oracleKp.publicKey,  isSigner: true,  isWritable: false },
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
