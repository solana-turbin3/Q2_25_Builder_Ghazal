import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    Transaction,
    SystemProgram,
    sendAndConfirmTransaction
  } from "@solana/web3.js";
  
  import wallet from "./dev-wallet.json";
  const from = Keypair.fromSecretKey(new Uint8Array(wallet));
  const connection = new Connection("https://api.devnet.solana.com");
  const to = new PublicKey("7S2dK5vbJqTXLT8WVYGf6yfUAvd7oCSuJwmECgrb2RBE");
  (async () => {
    try {
      // 1. Get current balance of your dev wallet
      const balance = await connection.getBalance(from.publicKey);
  
      // 2. Construct a "mock" transaction to figure out the exact fee
      let transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: from.publicKey,
          toPubkey: to,
          lamports: balance // all lamports
        })
      );
      transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
      transaction.feePayer = from.publicKey;
  
      // 3. Calculate the fee
      const feeForMessage = await connection.getFeeForMessage(
        transaction.compileMessage(),
        "confirmed"
      );
      const fee = feeForMessage.value || 0;
  
      // 4. Remove the instruction we added, then re-add it minus the fee
      transaction.instructions.pop();
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: from.publicKey,
          toPubkey: to,
          lamports: balance - fee
        })
      );
  
      // 5. Send and confirm the transaction
      const signature = await sendAndConfirmTransaction(connection, transaction, [from]);
      console.log(`Success! Check out your TX here:
      https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch(e) {
      console.error(`Oops, something went wrong: ${e}`);
    }
  })();
  
  