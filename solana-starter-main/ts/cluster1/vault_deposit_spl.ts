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
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

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
const program = new Program<WbaVault>(IDL, "D51uEDHLbWAxNfodfQDv7qkp8WZtxrhi3uganGbNos7o" as Address, provider);///????

// Create a random keypair
const vaultState = new PublicKey("<address>");////????the public key of your vaultState account that we created in vault_init.ts

// Create the PDA for our enrollment account
// const vaultAuth = ???

// Create the vault key
// const vault = ???

// const token_decimals = ???
// Derive PDAs
const [vaultAuth] = PublicKey.findProgramAddressSync(
  [Buffer.from("auth"), vaultState.toBuffer()],
  program.programId
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), vaultAuth.toBuffer()],
  program.programId
);
// Mint address
const mint = new PublicKey("<address>");///???
const token_decimals = 6; // example

// Execute our enrollment transaction
(async () => {
  try {
    // Get the token account of the fromWallet address, and if it does not exist, create it
    // const ownerAta = await getOrCreateAssociatedTokenAccount(
    //     ???
    // );
    // Get the token account of the fromWallet address, and if it does not exist, create it
    // const vaultAta = await getOrCreateAssociatedTokenAccount(
    //     ???
    // );
    // const signature = await program.methods
    // .depositSpl(new BN(<number>))
    // .accounts({
    //     ???
    // })
    // .signers([
    //     keypair
    // ]).rpc();
    // console.log(`Deposit success! Check out your TX here:\n\nhttps://explorer.solana.com/tx/${signature}?cluster=devnet`);
    const ownerAta = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      keypair.publicKey
    );
    // Vault's ATA
    const vaultAta = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      vaultAuth,
      true
    );

    // e.g. deposit 50 tokens => BN(50 * 10^6)
    const depositAmount = new BN(50 * 10 ** token_decimals);

    const signature = await program.methods
      .depositSpl(depositAmount)
      .accounts({
        vaultState,
        vaultAuth,
        vault,
        owner: keypair.publicKey,
        ownerAta: ownerAta.address,
        vaultAta: vaultAta.address,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .signers([keypair])
      .rpc();

    console.log(`Deposit SPL success! TX:
https://explorer.solana.com/tx/${signature}?cluster=devnet`);

  } catch (e) {
    console.error(`Oops, something went wrong: ${e}`);
  }
})();
