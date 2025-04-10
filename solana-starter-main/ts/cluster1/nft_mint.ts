import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createSignerFromKeypair, signerIdentity, generateSigner, percentAmount } from "@metaplex-foundation/umi"
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

import wallet from "./wallet/wba-wallet.json"
import base58 from "bs58";

const RPC_ENDPOINT = "https://api.devnet.solana.com";
const umi = createUmi(RPC_ENDPOINT);

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const myKeypairSigner = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(myKeypairSigner));
umi.use(mplTokenMetadata())

const mint = generateSigner(umi);

(async () => {
    // let tx = ???
    // let result = await tx.sendAndConfirm(umi);
    // const signature = base58.encode(result.signature);
    
    // console.log(`Succesfully Minted! Check out your TX here:\nhttps://explorer.solana.com/tx/${signature}?cluster=devnet`)
    let tx = createNft(umi, {
        mint,
        uri: "https://devnet.irys.xyz/BkVnK6wPr9Cvjzm7ZU2HXJkuv6cLNeCcLU43tV62BLmx", // Replace with your actual metadata URI
        name: "My Great NFT",
        symbol: "MGN",
        sellerFeeBasisPoints:percentAmount(5, 2), // 5% royalty
      });
  
      // 2) Send and confirm the transaction
      let result = await tx.sendAndConfirm(umi);
  
      // 3) Convert the returned signature to base58 for convenience
      const signature = base58.encode(result.signature);
  
      console.log(`Succesfully Minted! Check out your TX here:
  https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  
  
    console.log("Mint Address: ", mint.publicKey);
})();