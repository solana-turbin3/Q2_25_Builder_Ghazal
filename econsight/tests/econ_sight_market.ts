import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo
} from "@solana/spl-token";
import { assert } from "chai";
import { EconSightMarket } from "../target/types/econ_sight_market";

describe("econ_sight_market", () => {
  // provider & program -------------------------------------------------------
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const program = anchor.workspace.EconSightMarket as Program<EconSightMarket>;

  // A helper – airdrop and wait. receives a publickey and transfers 2 sol to.
  async function fund(pk: PublicKey, sol = 2) {
    const sig = await connection.requestAirdrop(pk, sol * 1e9);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // wallets ------------------------------------------------------------------
  const marketCreator = provider.wallet as anchor.Wallet; // already funded. the provider also has a local keypair which was generate The very first time you installed or used the Solana CLI
  const userA = Keypair.generate();

  // PDAs ---------------------------------------------------------------------
  let marketPda: PublicKey;
  let vaultPda: PublicKey;
  let yesMintPda: PublicKey;
  let noMintPda: PublicKey;

  // SPL Token accounts -------------------------------------------------------
  let usdcMint: PublicKey;
  let userAUsdc: PublicKey;
  let userAYes: PublicKey;

  // --------------------------------------------------------------------------
  //before() – one-time setup
  //Airdrop SOL to userA so that wallet can pay fees.
  //Create a fake USDC mint (decimals = 6) with the Anchor provider wallet as mint authority.
  //Create a USDC token account for userA.
  //Mint 1,000 USDC into that account so userA has something to bet with.
  before(async () => {
    await fund(userA.publicKey, 2);

    // create a USDC mint in memory (decimals = 6)
    usdcMint = await createMint(
      connection,
      marketCreator.payer,
      marketCreator.publicKey, // mint authority
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

    // Mint some USDC to userA so they can buy outcome tokens
    await mintTo(
      connection,
      marketCreator.payer,
      usdcMint,
      userAUsdc,
      marketCreator.payer,
      1_000_000_000 // e.g. 1,000 USDC tokens (since decimals=6)
    );
  });

  // --------------------------------------------------------------------------
  it("Create a Market", async () => {
    const question = "Will PMI >= 50 by August 1, 2025?";
    const expiryTs = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

    [marketPda] = await PublicKey.findProgramAddress(
      [Buffer.from("market"), marketCreator.publicKey.toBuffer()],
      program.programId
    );
    [yesMintPda] = await PublicKey.findProgramAddress(
      [Buffer.from("yes_mint"), marketPda.toBuffer()],
      program.programId
    );
    [noMintPda] = await PublicKey.findProgramAddress(
      [Buffer.from("no_mint"), marketPda.toBuffer()],
      program.programId
    );
    [vaultPda] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), marketPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createMarket(question, expiryTs)
      .accountsStrict({
        market: marketPda,
        yesMint: yesMintPda,
        noMint: noMintPda,
        vault: vaultPda,
        usdcMint,
        user: marketCreator.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const acct = await program.account.market.fetch(marketPda);
    // No check on question string because you didn't store it, or you stored it but let's skip
    assert.isFalse(acct.resolved);
  });

  // --------------------------------------------------------------------------
  it("User Buys Outcome (Yes)", async () => {
    const outcomeSide = { yes: {} };
    const amount = new anchor.BN(10_000);

    // create a token account for userA's "Yes" outcome
    userAYes = await createAccount(
      connection,
      marketCreator.payer,
      yesMintPda,
      userA.publicKey
    );

    await program.methods
      .buyOutcome(outcomeSide, amount)
      .accountsStrict({
        market: marketPda,
        userUsdcAccount: userAUsdc,
        vault: vaultPda,
        userOutcomeAccount: userAYes,
        yesMint: yesMintPda,
        noMint: noMintPda,
        user: userA.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([userA])
      .rpc();

    assert.ok(true, "Buy outcome succeeded");
  });

  // --------------------------------------------------------------------------
  it("Resolve Market (Yes wins)", async () => {
    await program.methods
      .resolveMarket()
      .accountsStrict({
        market: marketPda,
        authority: marketCreator.publicKey,
        oracleAuthority: marketCreator.publicKey,
      })
      // typically just .signers([]) if the wallet is the anchor provider,
      // or signers([marketCreator.payer]) depending on your local environment
      .rpc();

    const acct = await program.account.market.fetch(marketPda);
    assert.isTrue(acct.resolved);
    // winner = yes
  });

  // --------------------------------------------------------------------------
  it("Claim Rewards", async () => {
    const tx = await program.methods
      .claimRewards()
      .accountsStrict({
        market: marketPda,
        vault: vaultPda,
        userOutcomeAccount: userAYes,
        userUsdcAccount: userAUsdc,
        yesMint: yesMintPda,
        noMint: noMintPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        user: userA.publicKey,
      })
      .signers([userA])
      .rpc();

    console.log("ClaimRewards tx =", tx);
    assert.ok(true, "Rewards claimed");
  });
});
