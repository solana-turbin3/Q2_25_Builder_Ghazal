// tests/escrow.ts
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js"; // Import BN from bn.js library
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("escrow – happy path", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Use workspace loading (should work now without ES modules)
  const program = anchor.workspace.Escrow as any;

  // actors
  const maker = Keypair.generate();
  const taker = Keypair.generate();

  // constants - Use regular numbers for simplicity
  const seed = 42;  // Just use number instead of BN for simple values
  const makerDeposit = 10_000;  // mintA the maker locks
  const takerPay     = 5_000;   // mintB the taker pays

  // will fill later
  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerAtaA: PublicKey;
  let makerAtaB: PublicKey;
  let takerAtaA: PublicKey;
  let takerAtaB: PublicKey;
  let escrowPda: PublicKey;
  let escrowBump: number;
  let vaultA: PublicKey;

  /* -------------------------------------------------- */
  /* 1. fund test wallets & create two mints            */
  /* -------------------------------------------------- */
  before(async () => {
    // airdrop 2 SOL each
    for (const kp of [maker, taker]) {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(
          kp.publicKey,
          2 * anchor.web3.LAMPORTS_PER_SOL
        )
      );
    }

    // helper to create a mint with 6 decimals
    const createSplMint = async () =>
      createMint(
        provider.connection,
        maker,                      // Use maker as fee payer
        maker.publicKey,            // mint authority
        null,                       // freeze auth
        6                           // decimals
      );

    mintA = await createSplMint();
    
    // Create mintB with taker as authority
    mintB = await createMint(
      provider.connection,
      taker,                        // Use taker as fee payer
      taker.publicKey,              // mint authority
      null,                         // freeze auth
      6                             // decimals
    );

    // create (or get) ATAs and mint tokens
    makerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        maker,                      // Use maker as payer
        mintA,
        maker.publicKey
      )
    ).address;

    makerAtaB = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        maker,                      // Use maker as payer
        mintB,
        maker.publicKey
      )
    ).address;

    takerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        taker,                      // Use taker as payer
        mintA,
        taker.publicKey
      )
    ).address;

    takerAtaB = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        taker,                      // Use taker as payer
        mintB,
        taker.publicKey
      )
    ).address;

    // faucet some test tokens
    await mintTo(
      provider.connection,
      maker,                        // Use maker as payer and authority
      mintA,
      makerAtaA,
      maker,                        // maker is the mint authority
      makerDeposit                  // mintA -> maker (already a number)
    );

    await mintTo(
      provider.connection,
      taker,                        // Use taker as payer and authority
      mintB,
      takerAtaB,
      taker,                        // taker is the mint authority for mintB
      takerPay * 2                  // plenty of mintB -> taker (already a number)
    );
  });

  /* -------------------------------------------------- */
  /* 2. maker creates escrow and deposits mintA         */
  /* -------------------------------------------------- */
  it("maker make()", async () => {
    // derive PDA & vault
    [escrowPda, escrowBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        new BN(seed).toArrayLike(Buffer, "le", 8), // Use BN for proper little-endian conversion
      ],
      program.programId
    );

    vaultA = getAssociatedTokenAddressSync(mintA, escrowPda, true);

    // call make - use the camelCase field names
    await program.methods
      .make(new BN(seed), new BN(takerPay), new BN(makerDeposit))    // (seed, receiveAmount, depositAmount)
      .accounts({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,                   // This should be camelCase
        escrow: escrowPda,
        vault: vaultA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    // vault now holds makerDeposit
    const vaultAcc = await getAccount(provider.connection, vaultA);
    assert.equal(Number(vaultAcc.amount), makerDeposit);
  });

  /* -------------------------------------------------- */
  /* 3. taker takes escrow, pays mintB, gets mintA      */
  /* -------------------------------------------------- */
  it("taker take()", async () => {
    const preTakerA = Number((await getAccount(provider.connection, takerAtaA)).amount);
    const preMakerB = Number((await getAccount(provider.connection, makerAtaB)).amount);

    await program.methods
      .take()  // Remove seed parameter
      .accounts({
        taker: taker.publicKey,
        maker: maker.publicKey,
        mintA,
        mintB,
        takerMintAAta: takerAtaA,    // Use camelCase field names
        takerMintBAta: takerAtaB,
        makerMintBAta: makerAtaB,
        escrow: escrowPda,
        vault: vaultA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    const postTakerA = Number((await getAccount(provider.connection, takerAtaA)).amount);
    const postMakerB = Number((await getAccount(provider.connection, makerAtaB)).amount);

    assert.equal(postTakerA - preTakerA, makerDeposit, "taker received mintA");
    assert.equal(postMakerB - preMakerB, takerPay, "maker received mintB");

    // vault closed
    const vaultInfo = await provider.connection.getAccountInfo(vaultA);
    assert.isNull(vaultInfo, "vault should be closed");
  });
});