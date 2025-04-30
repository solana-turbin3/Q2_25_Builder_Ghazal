import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getProgram } from "../utils/anchorConnection";
import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export default function MarketDetail() {
  const router = useRouter();
  const { marketPda } = router.query; // from [marketPda].tsx
  const [market, setMarket] = useState<any>(null);
  const [amount, setAmount] = useState(10000); // 10,000 micro tokens
  const [side, setSide] = useState<"yes" | "no">("yes");

  // Load market details on page load
  useEffect(() => {
    if (!marketPda) return;
    (async () => {
      try {
        const program = getProgram();
        const pk = new PublicKey(marketPda);
        const acct = await program.account.market.fetch(pk);
        setMarket(acct);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [marketPda]);

  const handleBuy = async () => {
    if (!marketPda || !market) return;
    const program = getProgram();
    const pk = new PublicKey(marketPda);

    // For a real app, you need user USDC account, user outcome account, treasury, etc.
    // Here, we simply demonstrate the RPC call with placeholders.

    try {
      // outcomeSide is an Anchor enum. For "yes", use { yes: {} }. For "no", use { no: {} }
      const outcomeSide = side === "yes" ? { yes: {} } : { no: {} };
      await program.methods
        .buyOutcome(outcomeSide, new BN(amount))
        .accounts({
          // You must fill in real accounts here: userUsdcAccount, vault, treasuryAccount, userOutcomeAccount...
          // We'll do placeholders:
          market: pk,
          userUsdcAccount: new PublicKey("Fake111111111111111111111111111111111111111"),
          vault: market.vault,
          treasuryAccount: market.treasury,
          userOutcomeAccount: new PublicKey("Fake22222222222222222222222222222222222222"),
          yesMint: market.yesMint,
          noMint: market.noMint,
          user: program.provider.publicKey, // local or your wallet
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .rpc();

      alert("Bought outcome tokens!");
    } catch (err) {
      console.error(err);
      alert("Error buying outcome tokens.");
    }
  };

  const handleResolve = async () => {
    if (!marketPda) return;
    const program = getProgram();
    const pk = new PublicKey(marketPda);

    try {
      // For yes:
      const winnerSide = { yes: {} };

      await program.methods
        .resolveMarket(winnerSide)
        .accounts({
          market: pk,
          authority: program.provider.publicKey,
          oracleAuthority: program.provider.publicKey,
        })
        .rpc();

      alert("Market resolved as YES!");
    } catch (err) {
      console.error(err);
      alert("Error resolving market.");
    }
  };

  if (!market) return <div>Loading market info...</div>;

  return (
    <div>
      <h3>Market Detail</h3>
      <p><strong>Question:</strong> {market.question}</p>
      <p>
        <strong>Expiry:</strong>{" "}
        {new Date(Number(market.expiryTimestamp) * 1000).toLocaleString()}
      </p>
      <p><strong>Resolved:</strong> {market.resolved ? "Yes" : "No"}</p>
      {market.winner && <p><strong>Winner:</strong> {Object.keys(market.winner)[0]}</p>}

      <hr />
      <h4>Buy Outcome</h4>
      <div>
        <label>Side: </label>
        <select value={side} onChange={(e) => setSide(e.target.value as any)}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>
      <div>
        <label>Amount (micro tokens): </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </div>
      <button onClick={handleBuy}>Buy Outcome</button>

      <hr />
      {!market.resolved && (
        <div>
          <h4>Resolve Market</h4>
          <button onClick={handleResolve}>Resolve as YES</button>
          {/* For NO, do a different call passing { no: {} } */}
        </div>
      )}
    </div>
  );
}
