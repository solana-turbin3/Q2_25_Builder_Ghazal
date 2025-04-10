import {
  Connection,
  Keypair,
  SystemProgram,
  PublicKey,
  Commitment,
} from "@solana/web3.js";
import {
  Program,
  Wallet,
  AnchorProvider,
  Address,
  BN,
} from "@coral-xyz/anchor";
import { WbaVault, IDL } from "./programs/wba_vault";
import wallet from "./wallet/wba-wallet.json";

// Import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

// Commitment
const commitment: Commitment = "finalized";

// Create a devnet connection
const connection = new Connection("https://api.devnet.solana.com");

// Create our anchor provider
const provider = new AnchorProvider(connection, new Wallet(keypair), {
  commitment,
});

// Create our program
const program = new Program<WbaVault>(IDL, "<address>" as Address, provider);/////??????????

// Create a random keypair
const vaultState = new PublicKey("<address>");///??????
// Create the PDA for our enrollment account
// const vaultAuth = ???

// Create the vault key
// const vault = ???
const [vaultAuth] = PublicKey.findProgramAddressSync(
  [Buffer.from("auth"), vaultState.toBuffer()],
  program.programId
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), vaultAuth.toBuffer()],
  program.programId
);
// Execute our enrollment transaction
(async () => {
  try {
    // const signature = await program.methods
    // .deposit(new BN(<number>)    )
    // .accounts({
    //    ???
    // })
    // .signers([
    //     keypair
    // ]).rpc();
    // console.log(`Deposit success! Check out your TX here:\n\nhttps://explorer.solana.com/tx/${signature}?cluster=devnet`);
    // For example, deposit 0.2 SOL = 200_000_000 lamports
    const lamports = new BN(0.2 * 1e9);

    const signature = await program.methods
      .deposit(lamports) // If your method is named differently, rename
      .accounts({
        vaultState: vaultState,
        vaultAuth: vaultAuth,
        vault: vault,
        //user: keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([keypair])
      .rpc();

    console.log(`Deposit success! Check out your TX here:
https://explorer.solana.com/tx/${signature}?cluster=devnet`);

  } catch (e) {
    console.error(`Oops, something went wrong: ${e}`);
  }
})();
