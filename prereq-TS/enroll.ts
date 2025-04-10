import { Connection, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
import { IDL } from "./programs/Turbin3_prereq"; // The PDF's raw IDL
import wallet from "./dev-wallet.json";

const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));
const connection = new Connection("https://api.devnet.solana.com");
const provider = new AnchorProvider(connection, new Wallet(keypair), {
  commitment: "confirmed",
});

// Force-cast your IDL to Anchor's Idl interface
const program = new Program(IDL as unknown as Idl, provider);

(async () => {
  try {
    const txHash = await program.methods
      .submit(Buffer.from("ghazalassadipour", "utf8"))
      .accounts({ signer: keypair.publicKey })
      .signers([keypair])
      .rpc();

    console.log(`Success: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
  } catch (err) {
    console.error("Enrollment error:", err);
  }
})();
