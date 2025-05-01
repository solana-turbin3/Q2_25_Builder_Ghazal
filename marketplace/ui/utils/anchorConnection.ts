import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Idl, BN } from "@project-serum/anchor";
import idl from "../../target/idl/econ_sight_market.json"; // Adjust path as needed

// Read from .env or fallback to devnet
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "4n3PUjjcH54EpLfH3qbKofM2G5dGAYcpXo4vbeX3769a";

export const getProgram = (wallet?: any): Program => {
  const connection = new Connection(RPC_URL, "confirmed");

  // If you have a wallet adapter, you’d use that. 
  // For a quick demo, we can use AnchorProvider.local() or a Keypair you load.
  const provider = wallet
    ? new AnchorProvider(connection, wallet, { preflightCommitment: "processed" })
    : AnchorProvider.local(RPC_URL);

  const programID = new PublicKey(PROGRAM_ID);
  return new Program(idl as Idl, programID, provider);
};
