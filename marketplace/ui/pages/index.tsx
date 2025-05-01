import { useEffect, useState } from "react";
import { getProgram } from "../utils/anchorConnection";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";

interface MarketAccount {
  pubkey: PublicKey;
  account: {
    question: string;
    expiryTimestamp: number;
    resolved: boolean;
    winner: any;
    feeBps: number;
    treasury: PublicKey;
    // ...
  };
}

export default function Home() {
  const [markets, setMarkets] = useState<MarketAccount[]>([]);

  useEffect(() => {
    (async () => {
      const program = getProgram();
      // fetch all Market PDAs
      const marketPDAs = await program.account.market.all();
      // sort them by creation or show as-is
      setMarkets(marketPDAs as unknown as MarketAccount[]);
    })();
  }, []);

  return (
    <div>
      <h3>All Markets</h3>
      <Link href="/create-market" legacyBehavior>
        <a>Create New Market</a>
      </Link>
      <table border={1} cellPadding={5} style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Question</th>
            <th>Expiry</th>
            <th>Resolved?</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.pubkey.toBase58()}>
              <td>{m.account.question}</td>
              <td>{new Date(Number(m.account.expiryTimestamp) * 1000).toLocaleString()}</td>
              <td>{m.account.resolved ? "Yes" : "No"}</td>
              <td>
                <Link href={`/${m.pubkey.toBase58()}`} legacyBehavior>
                  <a>View</a>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
