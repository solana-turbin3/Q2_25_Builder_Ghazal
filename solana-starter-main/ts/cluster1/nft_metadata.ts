import wallet from "./wallet/wba-wallet.json"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi"
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"
import { readFile } from "fs/promises"; // to read our local image file

// Create a devnet connection
const umi = createUmi('https://api.devnet.solana.com');

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader({address:'https://devnet.irys.xyz'}));
umi.use(signerIdentity(signer));

(async () => {
    try {
        // Follow this JSON structure
        // https://docs.metaplex.com/programs/token-metadata/changelog/v1.0#json-structure

        // const image = ???
        // const metadata = {
        //     name: "?",
        //     symbol: "?",
        //     description: "?",
        //     image: "?",
        //     attributes: [
        //         {trait_type: '?', value: '?'}
        //     ],
        //     properties: {
        //         files: [
        //             {
        //                 type: "image/png",
        //                 uri: "?"
        //             },
        //         ]
        //     },
        //     creators: []
        // };
        // const myUri = ???
        // console.log("Your metadata URI: ", myUri);
        const image = `https://devnet.irys.xyz/EfeoX9MyDKgSjtLmyhZgyr86YNW9eTyWng1CuhTtPzWk`;

   
    const metadata = {
      name: "My NFT Title",
      symbol: "MYNFT",
      description: "An example NFT demonstrating Metaplex + Umi.",
      image: image, // Use the uploaded image URI
      attributes: [
        {
          trait_type: "Background",
          value: "Space"
        }
      ],
      properties: {
        files: [
          {
            type: "image/jpeg",
            uri: image
          }
        ]
      },
      creators: []
    };

    // Convert our JSON metadata object to a GenericFile
    const metadataFile = createGenericFile(
      Buffer.from(JSON.stringify(metadata)),
      "metadata.json",
      { contentType: "application/json" }
    );

    // Upload the JSON metadata
    // const myUri = ???
    const [myUri] = await umi.uploader.upload([metadataFile]);

    // Print out the final metadata URI
    console.log("Your metadata URI: ", myUri);

    }
    catch(error) {
        console.log("Oops.. Something went wrong", error);
    }
})();
