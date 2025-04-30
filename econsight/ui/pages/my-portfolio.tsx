import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getProgram } from "../utils/anchorConnection";
import { IdlAccounts } from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";

// If you declared something like: type Market = IdlAccounts<EconSightMarket>["market"];
// We’re just using 'any' for simplicity here.

export default function MyPortfolio() {
  const [positions, setPositions] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const program = getProgram();
        // Typically, you'd search for TokenAccounts where "mint" = any yesMint/noMint from your Market PDAs
        // Then cross-reference which accounts belong to the user's wallet.
        // For simplicity, we’ll pretend we have that data or skip it.

        const userPubkey = program.provider.publicKey;
        if (!userPubkey) return;

        // Example: fetch all markets, then check if user has outcome tokens, etc.
        const allMarkets = await program.account.market.all();
        const myPositions: any[] = [];

        for (const m of allMarkets) {
          const marketKey = m.publicKey;
          const marketAcct = m.account as any;
          // Pseudocode: "Check user's token balance for marketAcct.yesMint or noMint"
          // For real usage, you'd use getParsedTokenAccountsByOwner() or similar.
          // We'll just push placeholders:
          myPositions.push({
            market: marketKey.toBase58(),
            question: marketAcct.question,
            yesTokens: 0,
            noTokens: 0,
            resolved: marketAcct.resolved,
            winner: marketAcct.winner ? Object.keys(marketAcct.winner)[0] : null,
          });
        }

        setPositions(myPositions);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return (
    <div>
      <h3>My Portfolio</h3>
      <p>(Simplified version)</p>
      <table border={1} cellPadding={5}>
        <thead>
          <tr>
            <th>Market</th>
            <th>Question</th>
            <th>Yes Tokens</th>
            <th>No Tokens</th>
            <th>Resolved</th>
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, idx) => (
            <tr key={idx}>
              <td>{p.market}</td>
              <td>{p.question}</td>
              <td>{p.yesTokens}</td>
              <td>{p.noTokens}</td>
              <td>{p.resolved ? "Yes" : "No"}</td>
              <td>{p.winner ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
