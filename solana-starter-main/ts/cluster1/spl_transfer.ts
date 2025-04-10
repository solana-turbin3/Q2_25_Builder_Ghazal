import { Commitment,Transaction, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram ,sendAndConfirmTransaction} from "@solana/web3.js"
import wallet from "./wallet/wba-wallet.json"
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";

// We're going to import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

//Create a Solana devnet connection
const commitment: Commitment = "confirmed";
const connection = new Connection("https://api.devnet.solana.com", commitment);

// Mint address
const mint = new PublicKey("AWLHXqBQSAE9aWb8ib48tyjT4ZtnRcYS32G8brY3vTNZ");

// Recipient address
const to = new PublicKey("AEQUuQdzJbryKCcNTELAR8zL8rfpHhZK4npvezKaFVHu");

(async () => {
    try {
        const fromata = await getOrCreateAssociatedTokenAccount(connection,keypair,mint,keypair.publicKey);
        const toata =await getOrCreateAssociatedTokenAccount(connection,keypair,mint,keypair.publicKey);
        const tx=await transfer(connection,keypair,fromata.address,toata.address,keypair,1);
        console.log(`your transfer txid: ${tx}`);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();