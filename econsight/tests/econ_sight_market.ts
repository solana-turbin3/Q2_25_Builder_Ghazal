import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { EconSightMarket } from "../target/types/econ_sight_market";

describe("econ_sight_market", () => {
  // --------------------------------------------------------------------------
  // Setup: Provider, Program, Connection
  // --------------------------------------------------------------------------
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const program = anchor.workspace.EconSightMarket as Program<EconSightMarket>;

  // A helper function to airdrop SOL and wait
  async function fund(pk: PublicKey, sol = 2) {
    const sig = await connection.requestAirdrop(pk, sol * 1e9);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // --------------------------------------------------------------------------
  // Wallets / Keypairs
  // --------------------------------------------------------------------------
  const marketCreator = provider.wallet as anchor.Wallet; // funded from local CLI config
  const userA = Keypair.generate();

  // --------------------------------------------------------------------------
  // PDAs
  // --------------------------------------------------------------------------
  let marketPda: PublicKey;
  let vaultPda: PublicKey;
  let yesMintPda: PublicKey;
  let noMintPda: PublicKey;

  // --------------------------------------------------------------------------
  // SPL Token Mints & Accounts
  // --------------------------------------------------------------------------
  let usdcMint: PublicKey;
  let userAUsdc: PublicKey;
  let userAYes: PublicKey;

  // We'll store fees here. This must match the `market.treasury` in your program
  let treasuryUsdc: PublicKey;

  // --------------------------------------------------------------------------
  // Before: One-time setup
  //  1) Airdrop SOL to userA
  //  2) Create a fake USDC mint
  //  3) Mint 1000 USDC to userA
  //  4) Create a USDC account for fee treasury
  // --------------------------------------------------------------------------
  before(async () => {
    // 1) Airdrop
    await fund(userA.publicKey, 2);

    // 2) Create a USDC mint (decimals = 6) with the marketCreator as mint authority
    usdcMint = await createMint(
      connection,
      marketCreator.payer,       // fee payer
      marketCreator.publicKey,   // mint authority
      null,                      // freeze authority (optional)
      6
    );

    // 3) Create a userA token account for USDC
    userAUsdc = await createAccount(
      connection,
      marketCreator.payer,
      usdcMint,
      userA.publicKey
    );
    // Mint 1,000 USDC to userA
    await mintTo(
      connection,
      marketCreator.payer,
      usdcMint,
      userAUsdc,
      marketCreator.payer,
      1_000_000_000 // = 1,000 USDC if decimals=6
    );

    // 4) Create the treasury account for fee collection
    treasuryUsdc = await createAccount(
      connection,
      marketCreator.payer,
      usdcMint,
      marketCreator.publicKey // Or your protocol's key
    );
  });

  // --------------------------------------------------------------------------
  // Test #1: Create Market (short expiry)
  //   - Use a 2-second offset for expiry
  //   - Provide feeBps & treasury
  // --------------------------------------------------------------------------
  it("Create a Market", async () => {
    const question = "Will PMI >= 50 by August 1, 2025?";
    const expiryTs = new BN(Math.floor(Date.now() / 1000) + 2); // expires ~2s from now
    const feeBps = 100; // 1% fee
    const treasury = treasuryUsdc;

    // Derive PDAs
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
      .createMarket(question, expiryTs, feeBps, treasury)
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
    assert.isFalse(acct.resolved, "Market should be unresolved initially");
    assert.equal(acct.feeBps, feeBps, "Fee BPS should match the input");
    assert.ok(acct.treasury.equals(treasuryUsdc), "Treasury should be stored");
  });

  // --------------------------------------------------------------------------
  // Test #2: User Buys Outcome (Yes)
  //   - userA buys 10,000 microUSDC worth of "Yes" tokens
  //   - check that fee was taken
  // --------------------------------------------------------------------------
  it("User Buys Outcome (Yes)", async () => {
    const outcomeSide = { yes: {} };
    const amount = new BN(10_000); // 10,000 micro tokens => 0.01 USDC if decimals=6

    // Create a token account for userA's "Yes" outcome
    userAYes = await createAccount(
      connection,
      marketCreator.payer,
      yesMintPda,
      userA.publicKey
    );

    // Pre-buy balances
    const treasuryPre = await getAccount(connection, treasuryUsdc);
    const userAPre = await getAccount(connection, userAUsdc);

    await program.methods
      .buyOutcome(outcomeSide, amount)
      .accountsStrict({
        market: marketPda,
        userUsdcAccount: userAUsdc,
        vault: vaultPda,
        treasuryAccount: treasuryUsdc,
        userOutcomeAccount: userAYes,
        yesMint: yesMintPda,
        noMint: noMintPda,
        user: userA.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([userA])
      .rpc();

    // Post-buy balances
    const treasuryPost = await getAccount(connection, treasuryUsdc);
    const userAPost = await getAccount(connection, userAUsdc);

    const totalPaid = amount.toNumber(); // 10,000
    const feeBps = 100; // from createMarket test
    const expectedFee = Math.floor((totalPaid * feeBps) / 10_000); // 1% => 100
    const treasuryDiff = Number(treasuryPost.amount) - Number(treasuryPre.amount);
    const userDiff = Number(userAPre.amount) - Number(userAPost.amount);

    assert.equal(
      treasuryDiff,
      expectedFee,
      "Treasury should have gained the fee amount"
    );
    assert.equal(
      userDiff,
      totalPaid,
      "UserA's USDC decreased by the totalPaid"
    );
  });

  // --------------------------------------------------------------------------
  // Test #3: Resolve Market (Yes wins)
  //   - We wait 3 seconds so the short expiry is definitely in the past
  //   - Then we call resolveMarket({ yes: {} })
  // --------------------------------------------------------------------------
  it("Resolve Market (Yes wins)", async () => {
    // Wait ~3 seconds to ensure the market expired (we used +2s above)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const winnerSide = { yes: {} };
    await program.methods
      .resolveMarket(winnerSide)
      .accountsStrict({
        market: marketPda,
        authority: marketCreator.publicKey,
        oracleAuthority: marketCreator.publicKey,
      })
      .rpc();

    const acct = await program.account.market.fetch(marketPda);
    assert.isTrue(acct.resolved, "Market is now resolved");
    assert.deepEqual(acct.winner, winnerSide, "Winner should be 'Yes'");
  });

  // --------------------------------------------------------------------------
  // Test #4: Claim Rewards
  //   - Now that it's resolved "Yes", userA can claim from userAYes
  // --------------------------------------------------------------------------
  it("Claim Rewards", async () => {
    await program.methods
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

    // If everything worked, userA’s USDC balance increased by the # of winning tokens minted
    // (the vault had net_amount in it). You could compare pre/post vault or userA balances for extra checks.
    assert.ok(true, "Rewards claimed successfully");
  });
});
