import wallet from "./wallet/wba-wallet.json"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { 
    createMetadataAccountV3, 
    CreateMetadataAccountV3InstructionAccounts, 
    CreateMetadataAccountV3InstructionArgs,
    DataV2Args
} from "@metaplex-foundation/mpl-token-metadata";
import { createSignerFromKeypair, signerIdentity, publicKey } from "@metaplex-foundation/umi";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {PublicKey} from "@solana/web3.js"
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Wallet } from "@coral-xyz/anchor";
// Define our Mint address
const mint = new PublicKey("AWLHXqBQSAE9aWb8ib48tyjT4ZtnRcYS32G8brY3vTNZ")
const mint_umi = publicKey("AWLHXqBQSAE9aWb8ib48tyjT4ZtnRcYS32G8brY3vTNZ")
const [pda,bump]= PublicKey.findProgramAddressSync([Buffer.from("metadata"),mint.toBuffer()],TOKEN_PROGRAM_ID)

// Create a UMI connection
const umi = createUmi('https://api.devnet.solana.com');
const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(createSignerFromKeypair(umi, keypair)));

(async () => {
    try {
        // Start here
         let accounts: CreateMetadataAccountV3InstructionAccounts = {
            mint:mint_umi,
            mintAuthority:signer,

         }

         let data: DataV2Args = {
            name:"ghazal",
            symbol:"sol",
            uri: 'https://arweave.net/123456',
            sellerFeeBasisPoints:100_00,
            creators:null,
            collection:null,
            uses:null
             
         }

         let args: CreateMetadataAccountV3InstructionArgs = {
             data,
             isMutable:true,
             collectionDetails:null
         }

         let tx = createMetadataAccountV3(
             umi,
             {
                 ...accounts,
                 ...args
             }
         )

         let result = await tx.sendAndConfirm(umi);
         console.log(bs58.encode(result.signature));
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
