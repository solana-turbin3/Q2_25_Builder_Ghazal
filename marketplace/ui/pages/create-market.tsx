import { useState } from "react";
import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { getProgram } from "../utils/anchorConnection";
import { useRouter } from "next/router";

export default function CreateMarket() {
  const [question, setQuestion] = useState("Will PMI >= 50 by August 1, 2025?");
  const [expiry, setExpiry] = useState<number>(Math.floor(Date.now() / 1000) + 60);
  const [feeBps, setFeeBps] = useState<number>(100); // 1%
  const [treasury, setTreasury] = useState<string>(""); // user can choose or pre-populate
  const router = useRouter();

  const handleCreate = async () => {
    try {
      const program = getProgram();
      // If user doesn't provide a treasury, you might have a default
      const treasuryPubkey = treasury
        ? new PublicKey(treasury)
        : new PublicKey("INSERT_A_DEFAULT_TREASURY_HERE");

      await program.methods
        .createMarket(question, new BN(expiry), feeBps, treasuryPubkey)
        .accounts({})
        .rpc();

      alert("Market created!");
      router.push("/");
    } catch (err) {
      console.error(err);
      alert("Error creating market");
    }
  };

  return (
    <div>
      <h3>Create Market</h3>
      <p>Question:</p>
      <input
        style={{ width: "300px" }}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <p>Expiry Timestamp (Unix):</p>
      <input
        type="number"
        value={expiry}
        onChange={(e) => setExpiry(Number(e.target.value))}
      />
      <p>Fee BPS (1% = 100):</p>
      <input
        type="number"
        value={feeBps}
        onChange={(e) => setFeeBps(Number(e.target.value))}
      />
      <p>Treasury Token Account (optional):</p>
      <input
        style={{ width: "400px" }}
        value={treasury}
        onChange={(e) => setTreasury(e.target.value)}
      />
      <br />
      <button onClick={handleCreate} style={{ marginTop: 10 }}>
        Create
      </button>
    </div>
  );
}
