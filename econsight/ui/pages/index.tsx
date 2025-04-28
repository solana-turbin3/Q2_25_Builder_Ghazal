import { AnchorProvider, Program, web3 } from "@project-serum/anchor";
import idl from "../../idl/econ_sight_market.json"; // If you have an IDL

const programID = new web3.PublicKey("4n3PUjjcH54EpLfH3qbKofM2G5dGAYcpXo4vbeX3769a"); // Your program ID

// Example function to get the anchor Program
function getProgram() {
  const connection = new web3.Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
  const provider = new AnchorProvider(
    connection,
    window.solana,   // or wallet adapter
    { preflightCommitment: "processed" }
  );
  return new Program(idl, programID, provider);
}
