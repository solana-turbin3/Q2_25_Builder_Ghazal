// tests/econ_sight_market.ts
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js"
import { Program, AnchorProvider, web3, Idl } from "@coral-xyz/anchor";
//import { Program, BN, AnchorProvider, web3, Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// 1) Import the auto-generated IDL and the JSON

const idl = require("../target/idl/econ_sight_market.json");
import { EconSightMarket } from "../target/types/econ_sight_market";

describe("econ_sight_market", () => {
  // A) Create a custom provider + connection
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;


//const PROGRAM_ID = new web3.PublicKey("D7tjXkMzz3Gd3BAfiur8kSCWeSxJEhWLejncLBnr2mwg");

//const program = anchor.workspace.EconSightMarket as Program<EconSightMarket>;
const program  = anchor.workspace.EconSightMarket as Program<EconSightMarket>;
const PROGRAM_ID = program.programId;  

async function fund(pk: PublicKey, sol = 2) {
    const sig = await connection.requestAirdrop(pk, sol * 1e9);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // Keypairs, PDAs, etc.
  const marketCreator = provider.wallet as anchor.Wallet;
  const userA = Keypair.generate();

  let marketPda: PublicKey;
  let vaultPda: PublicKey;
  let yesMintPda: PublicKey;
  let noMintPda: PublicKey;

  let usdcMint: PublicKey;
  let userAUsdc: PublicKey;
  let userAYes: PublicKey;
  let treasuryUsdc: PublicKey;

  // --------------------------------------------------------------------------
  // SETUP
  // --------------------------------------------------------------------------
  before(async () => {
    await fund(userA.publicKey, 2);

    // create a USDC mint in memory
    usdcMint = await createMint(
      connection,
      marketCreator.payer,
      marketCreator.publicKey,
      null,
      6
    );
    // create a token account for userA
    userAUsdc = await createAccount(
      connection,
      marketCreator.payer,
      usdcMint,
      userA.publicKey
    );
    await mintTo(
      connection,
      marketCreator.payer,
      usdcMint,
      userAUsdc,
      marketCreator.payer,
      1_000_000_000
    );

    treasuryUsdc = await createAccount(
      connection,
      marketCreator.payer,
      usdcMint,
      marketCreator.publicKey
    );
  });

  // --------------------------------------------------------------------------
  it("Create a Market", async () => {
    const question = "Will PMI >= 50 by Aug 1, 2025?";
    const expiryTs = new BN(Math.floor(Date.now() / 1000) + 2);
    const feeBps = 100;
    const bValScaled = new BN(10_000_000);

    [marketPda] = await PublicKey.findProgramAddress(
      [Buffer.from("market"), marketCreator.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log("🛈  Market PDA =", marketPda.toBase58());
    [yesMintPda] = await PublicKey.findProgramAddress(
      [Buffer.from("yes_mint"), marketPda.toBuffer()],
      PROGRAM_ID
    );
    [noMintPda] = await PublicKey.findProgramAddress(
      [Buffer.from("no_mint"), marketPda.toBuffer()],
      PROGRAM_ID
    );
    [vaultPda] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), marketPda.toBuffer()],
      PROGRAM_ID
    );

    await program.methods
      .createMarket(question, expiryTs, feeBps, treasuryUsdc, bValScaled)
      .accounts({
        market: marketPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        vault: vaultPda,
        usdcMint,
        user: marketCreator.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

      console.log("Available account namespaces:", Object.keys(program.account));
    const acct = await program.account.marketState.fetch(marketPda);
   
    
    assert.equal(Number(acct.bValueScaled), 10_000_000);
  });

  // --------------------------------------------------------------------------
  it("User Buys Outcome (Yes)", async () => {
    const amount = new BN(1_000);

    userAYes = await createAccount(
      connection,
      marketCreator.payer,
      yesMintPda,
      userA.publicKey
    );

    const treasuryPre = await getAccount(connection, treasuryUsdc);
    const userPre = await getAccount(connection, userAUsdc);

    await program.methods
      .buyOutcome({ yes: {} }, amount)
      .accounts({
        market: marketPda,
        userUsdcAccount: userAUsdc,
        vault: vaultPda,
        treasuryAccount: treasuryUsdc,
        userOutcomeAccount: userAYes,
        yesMint: yesMintPda,
        noMint: noMintPda,
        user: userA.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      } as any)
      .signers([userA])
      .rpc();

    const treasuryPost = await getAccount(connection, treasuryUsdc);
    const userPost = await getAccount(connection, userAUsdc);

    const treasuryDiff = Number(treasuryPost.amount) - Number(treasuryPre.amount);
    const userDiff = Number(userPre.amount) - Number(userPost.amount);

    assert.isAbove(treasuryDiff, 0, "Some fee was charged");
    assert.isAtLeast(userDiff, amount.toNumber(), "User paid >= requested");
  });

  // --------------------------------------------------------------------------
  it("Resolve Market (Yes wins)", async () => {
    await new Promise((r) => setTimeout(r, 3000));

    await program.methods
      .resolveMarket({ yes: {} })
      .accounts({
        market: marketPda,
        authority: marketCreator.publicKey,
        oracleAuthority: marketCreator.publicKey,
      } as any)
      .rpc();
  });

  // --------------------------------------------------------------------------
  it("Claim Rewards", async () => {
    await program.methods
      .claimRewards()
      .accounts({
        market: marketPda,
        vault: vaultPda,
        userOutcomeAccount: userAYes,
        userUsdcAccount: userAUsdc,
        yesMint: yesMintPda,
        noMint: noMintPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        user: userA.publicKey,
      } as any)
      .signers([userA])
      .rpc();

    assert.ok(true, "Rewards claimed");
  });
});
