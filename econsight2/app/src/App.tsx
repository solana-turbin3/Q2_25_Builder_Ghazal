/******************************************************************** 
 * app/src/App.tsx – EconSight with Oracle Integration
 * • Automatic oracle resolution when markets expire
 * • Real-time countdown timers
 * • AI-powered market resolution
 * • No manual resolution needed
 *******************************************************************/
import React, { useCallback, useEffect, useMemo, useState } from "react";

/* ── Solana / wallet adapters ────────────────────────────────── */
import { ConnectionProvider, WalletProvider, useConnection, useAnchorWallet,} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton,} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

/* ── Anchor + SPL helpers ────────────────────────────────────── */
import { AnchorProvider, BN, Program, utils as anchorUtils, ProgramAccount,} from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction,} from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID,} from "@solana/spl-token";

/* ── IDL & generated types ───────────────────────────────────── */
import idl from "../idl/econsightmarket23.json";
import type { Econsightmarket2 } from "../idl/types/econsightmarket23";

/* ── Oracle service ──────────────────────────────────────────── */
import { oracleService } from "./services/oracleService";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

/* ════════════════════════════ ENV CONSTANTS & PDA helpers ════════════════════════════ */
const RPC_URL = import.meta.env.VITE_RPC_URL as string;
const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID);
const USDC_MINT = new PublicKey(import.meta.env.VITE_USDC_MINT);

const SEED_BYTES = anchorUtils.bytes.utf8.encode("market");
const YES_BYTES = anchorUtils.bytes.utf8.encode("yes_mint");
const NO_BYTES = anchorUtils.bytes.utf8.encode("no_mint");

function derivePdas(seed: BN, creator: PublicKey) {
  const market = PublicKey.findProgramAddressSync(
    [SEED_BYTES, creator.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  )[0];
  const yesMint = PublicKey.findProgramAddressSync([YES_BYTES, market.toBuffer()], PROGRAM_ID)[0];
  const noMint = PublicKey.findProgramAddressSync([NO_BYTES, market.toBuffer()], PROGRAM_ID)[0];
  const vault = getAssociatedTokenAddressSync(
    USDC_MINT,
    market,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return { market, yesMint, noMint, vault };
}

/* ════════════════════════════ Minimal client-side LMSR math ════════════════════════════ */
const MAX_EXP_INPUT = 25_000;
const B_VALUE = 1_000; // same as on-chain
const MICROS_PER_USDC = 1_000_000;

const logSumExp = (x:number, y:number) => {
  const m = Math.max(x, y);
  return m + Math.log1p(Math.exp(Math.min(x, y) - m));
};

const lmsrCost = (b:number, y:number, n:number) => {
  const ry = y / b, rn = n / b;
  if (ry > MAX_EXP_INPUT || rn > MAX_EXP_INPUT) return Infinity;
  return b * logSumExp(ry, rn);
};

const lmsrBuyCost = (
  b:number, 
  curYes:number, 
  curNo:number, 
  buyYes:boolean, 
  delta:number
) => {
  const before = lmsrCost(b, curYes, curNo);
  const after = buyYes ? lmsrCost(b, curYes + delta, curNo) : lmsrCost(b, curYes, curNo + delta);
  return Math.max(0, after - before); // µUSDC
};

/* ════════════════════════════ React component ════════════════════════════ */
type MarketAcc = Awaited<
  ReturnType<Program<Econsightmarket2>["account"]["marketState"]["fetch"]>
>;

/* ──────── Countdown Timer Component ──────── */
function CountdownTimer({ expiryTimestamp, onExpired }: { 
  expiryTimestamp: number; 
  onExpired: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, expiryTimestamp - now);
      setTimeLeft(remaining);
      
      if (remaining === 0) {
        onExpired();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiryTimestamp, onExpired]);

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "EXPIRED";
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const isExpired = timeLeft <= 0;
  const isClosing = timeLeft <= 30; // Last 30 seconds

  return (
    <span style={{
      color: isExpired ? "#dc2626" : isClosing ? "#f59e0b" : "#059669",
      fontWeight: isExpired || isClosing ? "bold" : "normal"
    }}>
      {isExpired ? "⏰ EXPIRED" : `⏱️ ${formatTime(timeLeft)}`}
    </span>
  );
}

function Main() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  /* provider / program */
  const provider = useMemo(
    () => anchorWallet ? new AnchorProvider(connection, anchorWallet, { preflightCommitment: "processed" }) : null,
    [connection, anchorWallet]
  );

  const program = useMemo(
    () => provider ? (new Program(idl as any, provider as any) as Program<Econsightmarket2>) : null,
    [provider]
  );

  /* ── state ─────────────────────────────────────────────── */
  const [question, setQuestion] = useState("");
  const [markets, setMarkets] = useState<ProgramAccount<MarketAcc>[]>([]);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [input, setInput] = useState<Record<string,string>>({});
  const [vaultBalances, setVaultBalances] = useState<Record<string, number>>({});
  const [oracleActivity, setOracleActivity] = useState<Record<string, string>>({});

  /* loaders */
  const reloadMarkets = useCallback(async()=>{
    if (!program) return;
    setMarkets(await program.account.marketState.all() as any);
  },[program]);

  const reloadBalance = useCallback(async()=>{
    if (!anchorWallet) return;
    const lamports = await connection.getBalance(anchorWallet.publicKey,"processed");
    setBalance(lamports/1_000_000_000);
  },[connection, anchorWallet]);

  useEffect(()=>{
    reloadMarkets();
    reloadBalance();
  }, [reloadMarkets, reloadBalance]);

  /* NEW: Auto-resolve expired markets */
  const handleMarketExpired = useCallback(async (marketPk: PublicKey, marketAccount: MarketAcc) => {
    if (!provider || !program || marketAccount.resolved) return;

    const marketId = marketPk.toBase58();
    
    // Prevent multiple resolution attempts
    if (oracleActivity[marketId]) return;
    
    setOracleActivity(prev => ({ ...prev, [marketId]: "🤖 Oracle resolving..." }));

    try {
      await oracleService.autoResolveIfExpired(
        marketPk,
        marketAccount.question,
        marketAccount.expiryTimestamp.toNumber(),
        marketAccount.resolved,
        provider,
        program,
        (decision: string, txId: string) => {
          setOracleActivity(prev => ({ 
            ...prev, 
            [marketId]: `✅ Resolved: ${decision}` 
          }));
          
          // Reload markets to show new state
          setTimeout(() => {
            reloadMarkets();
            // Clear activity after 5 seconds
            setTimeout(() => {
              setOracleActivity(prev => {
                const updated = { ...prev };
                delete updated[marketId];
                return updated;
              });
            }, 5000);
          }, 1000);
        }
      );
    } catch (error: any) {
      console.error("Auto-resolution failed:", error);
      setOracleActivity(prev => ({ 
        ...prev, 
        [marketId]: "❌ Resolution failed" 
      }));
      
      // Clear error after 3 seconds
      setTimeout(() => {
        setOracleActivity(prev => {
          const updated = { ...prev };
          delete updated[marketId];
          return updated;
        });
      }, 3000);
    }
  }, [provider, program, reloadMarkets, oracleActivity]);

  /* Better price formatting */
  const formatPrice = (price: number) => {
    if (price === 0) return "0.000000";
    if (price >= 0.001) return price.toFixed(4);
    if (price >= 0.000001) return price.toFixed(6);
    return price.toExponential(2);
  };

  /* Fetch vault balance for a market */
  const fetchVaultBalance = async (marketPk: PublicKey, marketAccount: any) => {
    if (!connection) return;
    try {
      const pdas = derivePdas(new BN(marketAccount.seed.toNumber()), marketAccount.authority);
      const vaultBalance = await connection.getTokenAccountBalance(pdas.vault);
      const vaultUSDC = Number(vaultBalance.value.amount) / MICROS_PER_USDC;
      setVaultBalances(prev => ({...prev, [marketPk.toBase58()]: vaultUSDC}));
    } catch (error) {
      console.log("Couldn't fetch vault balance:", error);
    }
  };

  /* create market - now with better expiry time */
  const createMarket = async () => {
    if (!program || !anchorWallet) return;
    if (!question.trim()) return alert("Enter a question");

    const seed = new BN(Date.now() & 0xffffffff);
    const pdas = derivePdas(seed, anchorWallet.publicKey);

    setBusy(true);
    try{
      await program.methods
        .createMarket(
          seed,
          question,
          new BN(Math.floor(Date.now()/1000)+40), // 60 seconds for demo
          100, // 1 % fee
          anchorWallet.publicKey,
          new BN(B_VALUE * MICROS_PER_USDC)
        )
        .accounts({
          market:pdas.market,
          yesMint:pdas.yesMint,
          noMint:pdas.noMint,
          vault:pdas.vault,
          usdcMint:USDC_MINT,
          user:anchorWallet.publicKey,
          systemProgram:SystemProgram.programId,
          tokenProgram:TOKEN_PROGRAM_ID,
          associatedTokenProgram:ASSOCIATED_TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
      setQuestion("");
      await reloadMarkets();
    }catch(err){
      console.error(err);
      alert((err as Error).message);
    } finally{
      setBusy(false);
    }
  };

  /* buy outcome */
  const buy = async (pk:PublicKey, acc:MarketAcc, side:"yes"|"no")=>{
    if (!program || !anchorWallet) return;
    const shares = Number(input[pk.toBase58()]||"0");
    if (!(shares>0)) return alert("Enter #shares > 0");

    const costµ = lmsrBuyCost(
      B_VALUE,
      acc.yesShares.toNumber(),
      acc.noShares.toNumber(),
      side==="yes",
      shares
    );
    if(!Number.isFinite(costµ)) return alert("Overflow – trade too large");
    if(balance!==null && costµ/MICROS_PER_USDC > balance) return alert("Insufficient SOL/USDC");

    const pdas = derivePdas(new BN(acc.seed.toNumber()), acc.authority);
    const userUsdc = getAssociatedTokenAddressSync(
      USDC_MINT,
      anchorWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const outMint = side==="yes" ? pdas.yesMint : pdas.noMint;
    const userOut = getAssociatedTokenAddressSync(
      outMint,
      anchorWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    /* create ATAs if missing */
    const pre:TransactionInstruction[] = [];
    try{
      await getAccount(connection, userUsdc);
    } catch{
      pre.push(createAssociatedTokenAccountInstruction(
        anchorWallet.publicKey,
        userUsdc,
        anchorWallet.publicKey,
        USDC_MINT
      ));
    }
    try{
      await getAccount(connection, userOut);
    } catch{
      pre.push(createAssociatedTokenAccountInstruction(
        anchorWallet.publicKey,
        userOut,
        anchorWallet.publicKey,
        outMint
      ));
    }
    if(pre.length) await provider!.sendAndConfirm(new Transaction().add(...pre));

    setBusy(true);
    try{
      await program.methods
        .buyOutcome(side==="yes"?{yes:{}}:{no:{}}, new BN(shares))
        .accounts({
          market:pk,
          userUsdcAccount:userUsdc,
          usdcMint:USDC_MINT,
          vault:pdas.vault,
          treasuryAccount:userUsdc,
          userOutcomeAccount:userOut,
          yesMint:pdas.yesMint,
          noMint:pdas.noMint,
          user:anchorWallet.publicKey,
          tokenProgram:TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      /* quick in-place update */
      const fresh = await program.account.marketState.fetch(pk);
      setMarkets(ms => ms.map(m => m.publicKey.equals(pk) ? { ...m, account:fresh } : m));

      setInput(p=>({...p,[pk.toBase58()]:""}));
      await reloadBalance();
      
      // Clear vault balance cache to force refresh
      setVaultBalances(prev => {
        const updated = {...prev};
        delete updated[pk.toBase58()];
        return updated;
      });
    }catch(err){
      console.error(err);
      alert((err as Error).message);
    } finally{
      setBusy(false);
    }
  };

  /* claim rewards – show how much you got */
  const claim = async(pk:PublicKey, acc:MarketAcc)=>{
    if(!program||!anchorWallet) return;
    const pdas = derivePdas(new BN(acc.seed.toNumber()), acc.authority);
    const winYes = acc.winner && "yes" in acc.winner;
    const winMint = winYes ? pdas.yesMint : pdas.noMint;

    const userOutcome = getAssociatedTokenAddressSync(
      winMint,
      anchorWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const userUsdc = getAssociatedTokenAddressSync(
      USDC_MINT,
      anchorWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    /* balance before */
    const before = await connection.getTokenAccountBalance(userUsdc,"processed");
    const balBefore = Number(before.value.amount) / MICROS_PER_USDC;

    setBusy(true);
    try{
      await program.methods
        .claimRewards()
        .accounts({
          market:pk,
          vault:pdas.vault,
          usdcMint:USDC_MINT,
          userOutcomeAccount:userOutcome,
          userUsdcAccount:userUsdc,
          yesMint:pdas.yesMint,
          noMint:pdas.noMint,
          tokenProgram:TOKEN_PROGRAM_ID,
          user:anchorWallet.publicKey,
        } as any)
        .rpc();

      const after = await connection.getTokenAccountBalance(userUsdc,"processed");
      const balAfter = Number(after.value.amount) / MICROS_PER_USDC;
      const earned = balAfter - balBefore;

      await reloadBalance();
      alert(`Rewards claimed: ${earned.toFixed(6)} USDC`);
    }catch(err){console.error(err);alert((err as Error).message);}
    finally{setBusy(false);}
  };

  /* util */
  const fmt = (n:number)=>n.toLocaleString("en-US");

  /* ════════════════════════════ FULL style object ════════════════════════════ */
  const styles:{[k:string]:React.CSSProperties} = {
    container:{minHeight:"100vh",background:"linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
      fontFamily:"system-ui,-apple-system,sans-serif"},
    header:{background:"white",boxShadow:"0 2px 10px rgba(0,0,0,0.1)",padding:"20px 0"},
    headerContent:{maxWidth:"1200px",margin:"0 auto",padding:"0 24px",
      display:"flex",justifyContent:"space-between",alignItems:"center"},
    logo:{display:"flex",alignItems:"center",gap:"12px"},
    logoIcon:{width:"40px",height:"40px",borderRadius:"12px",
      background:"linear-gradient(135deg,#667eea,#764ba2)",
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px"},
    title:{fontSize:"28px",fontWeight:"bold",color:"#1f2937",margin:0},
    subtitle:{fontSize:"14px",color:"#6b7280",margin:0},
    headerButtons:{display:"flex",gap:"12px",alignItems:"center"},
    balanceCard:{background:"rgba(255,255,255,0.9)",borderRadius:"12px",
      padding:"12px 16px",display:"flex",alignItems:"center",gap:"8px",
      fontSize:"14px",fontWeight:500,color:"#374151",
      border:"1px solid rgba(255,255,255,0.2)"},
    main:{maxWidth:"1200px",margin:"0 auto",padding:"32px 24px"},
    grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(400px,1fr))",gap:"32px"},
    card:{background:"white",borderRadius:"16px",
      boxShadow:"0 10px 25px rgba(0,0,0,0.1)",padding:"24px"},
    cardHeader:{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"},
    cardIcon:{width:"32px",height:"32px",borderRadius:"8px",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:"16px",fontWeight:"bold"},
    cardTitle:{fontSize:"20px",fontWeight:600,color:"#1f2937",margin:0},
    formGroup:{marginBottom:"20px"},
    label:{display:"block",fontSize:"14px",fontWeight:500,color:"#374151",marginBottom:"8px"},
    input:{width:"100%",padding:"12px 16px",border:"2px solid #e5e7eb",borderRadius:"12px",
      fontSize:"16px",outline:"none",transition:"border-color 0.2s",boxSizing:"border-box"},
    createBtn:{width:"100%",background:"linear-gradient(135deg,#10b981,#059669)",color:"white",
      border:"none",padding:"14px 24px",borderRadius:"12px",fontSize:"16px",fontWeight:600,
      cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"},
    refreshBtn:{background:"#3b82f6",color:"white",border:"none",padding:"8px 16px",
      borderRadius:"8px",fontSize:"14px",fontWeight:500,cursor:"pointer",
      display:"flex",alignItems:"center",gap:"6px"},
    marketsList:{maxHeight:"500px",overflowY:"auto"},
    marketItem:{border:"2px solid #e5e7eb",borderRadius:"12px",padding:"16px",marginBottom:"16px",
      transition:"border-color 0.2s, box-shadow 0.2s"},
    marketQuestion:{fontSize:"16px",fontWeight:600,color:"#1f2937",marginBottom:"12px",lineHeight:1.4},
    marketDetail:{display:"flex",justifyContent:"space-between",alignItems:"center",
      fontSize:"14px",marginBottom:"8px"},
    statusOpen:{display:"flex",alignItems:"center",gap:"6px",color:"#059669",fontWeight:500},
    statusResolved:{display:"flex",alignItems:"center",gap:"6px",color:"#dc2626",fontWeight:500},
    dot:{width:"8px",height:"8px",borderRadius:"50%"},
    emptyState:{textAlign:"center",padding:"48px 0",color:"#6b7280"},
    emptyIcon:{fontSize:"48px",marginBottom:"16px"},
    connectCard:{background:"white",borderRadius:"16px",
      boxShadow:"0 10px 25px rgba(0,0,0,0.1)",padding:"32px",
      textAlign:"center",maxWidth:"400px",margin:"20vh auto"},
    oracleStatus:{background:"rgba(34, 197, 94, 0.1)",border:"1px solid rgba(34, 197, 94, 0.2)",
      borderRadius:"8px",padding:"8px 12px",fontSize:"12px",color:"#16a34a",fontWeight:500}
  };

  /* connect-wallet splash */
  if(!program){
    return(
      <div style={styles.container}>
        <div style={styles.connectCard}>
          <div style={{...styles.logoIcon,margin:"0 auto 24px",width:64,height:64,fontSize:32}}>
            🔮
          </div>
          <h1 style={{...styles.title,marginBottom:16}}>EconSight v2</h1>
          <p style={{color:"#6b7280",marginBottom:8}}>AI-Powered Prediction Markets</p>
          <p style={{color:"#6b7280",marginBottom:24,fontSize:12}}>Markets resolve automatically with O3 Oracle</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  /* UI */
  return(
    <div style={styles.container}>
      {/* header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>
              🔮
            </div>
            <div>
              <h1 style={styles.title}>EconSight v2</h1>
              <p style={styles.subtitle}>AI-Powered Prediction Markets</p>
            </div>
          </div>
          <div style={styles.headerButtons}>
            <div style={styles.balanceCard}>
              {balance===null?"…" : balance.toFixed(4)+" SOL"}
            </div>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* body */}
      <main style={styles.main}>
        <div style={styles.grid}>
          {/* create card */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{...styles.cardIcon,background:"#dcfce7",color:"#16a34a"}}>＋</div>
              <h2 style={styles.cardTitle}>Create Market</h2>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Yes/No Question</label>
              <input 
                style={styles.input}
                placeholder="Will Vancouver's tech sector raise over $1B CAD in 2025?"
                value={question}
                onChange={e=>setQuestion(e.target.value)}
              />
            </div>
            <button 
              style={{...styles.createBtn,opacity:busy?0.5:1,cursor:busy?"not-allowed":"pointer"}}
              disabled={busy}
              onClick={createMarket}
            >
              {busy?"Creating…":"🚀 Create (40s expiry + AI resolution)"}
            </button>
          </div>

          {/* markets list */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{...styles.cardIcon,background:"#dbeafe",color:"#2563eb"}}>
                📊
              </div>
              <h2 style={styles.cardTitle}>Live Markets</h2>
              <button style={styles.refreshBtn} onClick={reloadMarkets}>↻ Refresh</button>
            </div>

            <div style={styles.marketsList}>
              {markets.length===0 && (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>
                    🔮
                  </div>
                  <p>No markets yet - create one above!</p>
                </div>
              )}

              {markets.map(({publicKey:pk,account:a})=>{
                const id = pk.toBase58();
                const typed = Number(input[id]||"0");
                
                // LMSR prices
                const p1Yes = lmsrBuyCost(B_VALUE,a.yesShares.toNumber(),a.noShares.toNumber(),true ,1)/MICROS_PER_USDC;
                const p1No = lmsrBuyCost(B_VALUE,a.yesShares.toNumber(),a.noShares.toNumber(),false,1)/MICROS_PER_USDC;
                const costYes= typed>0 ? lmsrBuyCost(B_VALUE,a.yesShares.toNumber(),a.noShares.toNumber(),true ,typed)/MICROS_PER_USDC : 0;
                const costNo = typed>0 ? lmsrBuyCost(B_VALUE,a.yesShares.toNumber(),a.noShares.toNumber(),false,typed)/MICROS_PER_USDC : 0;
                
                // Vault balance and payout calculation
                const vaultBalance = vaultBalances[id] || 0;
                const totalWinningShares = a.resolved ? 
                  (a.winner && "yes" in a.winner ? a.yesShares.toNumber() : a.noShares.toNumber()) :
                  Math.max(a.yesShares.toNumber(), a.noShares.toNumber());
                const payoutPerToken = totalWinningShares > 0 ? vaultBalance / totalWinningShares : 0;
                
                const expired = Date.now()/1000 > a.expiryTimestamp.toNumber();
                const resolved = a.resolved;
                const isCreator = anchorWallet?.publicKey.equals(a.authority);
                const activity = oracleActivity[id];

                return (
                  <div key={id} style={styles.marketItem}>
                    <div style={styles.marketQuestion}>{a.question}</div>

                    <div style={styles.marketDetail}>
                      <span>Expires:</span>
                      <CountdownTimer 
                        expiryTimestamp={a.expiryTimestamp.toNumber()}
                        onExpired={() => handleMarketExpired(pk, a)}
                      />
                    </div>

                    <div style={styles.marketDetail}>
                      <span>Totals:</span>
                      <span>YES {fmt(a.yesShares.toNumber())} / NO {fmt(a.noShares.toNumber())}</span>
                    </div>

                    <div style={styles.marketDetail}>
                      <span>Price (next share):</span>
                      <span>YES ≈ {formatPrice(p1Yes)} | NO ≈ {formatPrice(p1No)} USDC</span>
                    </div>

                    {/* Show vault balance info */}
                    {vaultBalance > 0 && (
                      <div style={styles.marketDetail}>
                        <span>Reward per winning token:</span>
                        <span style={{color:"#10b981"}}>{formatPrice(payoutPerToken)} USDC</span>
                        <button 
                          style={{marginLeft: "8px", fontSize: "12px", padding: "2px 6px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer"}}
                          onClick={() => fetchVaultBalance(pk, a)}
                        >
                          ↻
                        </button>
                      </div>
                    )}

                    {/* Oracle activity indicator */}
                    {activity && (
                      <div style={styles.marketDetail}>
                        <span>Oracle Status:</span>
                        <div style={styles.oracleStatus}>{activity}</div>
                      </div>
                    )}

                    {/* Cost preview */}
                    {typed>0 && (
                      <div style={{...styles.marketDetail,color:"#6b7280"}}>
                        Cost for {typed} share{typed!==1&&"s"}:&nbsp;
                        YES ≈ {formatPrice(costYes)} | NO ≈ {formatPrice(costNo)} USDC
                      </div>
                    )}

                    <div style={styles.marketDetail}>
                      <span>Status:</span>
                      {resolved ? (
                        <div style={styles.statusResolved}>
                          <div style={{...styles.dot,background:"#dc2626"}}></div>
                          🤖 {a.winner && "yes" in a.winner ? "YES":"NO"} (AI Oracle)
                        </div>
                      ):(
                        <div style={styles.statusOpen}>
                          <div style={{...styles.dot,background:"#059669"}}></div>Open
                        </div>
                      )}
                    </div>

                    {/* buy UI */}
                    {!resolved && !expired && (
                      <div style={{marginTop:8}}>
                        <input 
                          type="number" min="0" step="1" placeholder="shares"
                          value={input[id]||""} 
                          onChange={e=>setInput(p=>({...p,[id]:e.target.value}))}
                          style={{width:"60%",marginRight:6,padding:"6px",border:"1px solid #d1d5db",borderRadius:"4px"}} 
                        />
                        <button 
                          disabled={busy||typed<=0||!Number.isFinite(costYes)} 
                          onClick={()=>buy(pk,a,"yes")}
                          style={{marginRight:4,padding:"6px 12px",background:busy||typed<=0?"#9ca3af":"#10b981",color:"white",border:"none",borderRadius:"4px",cursor:busy||typed<=0?"not-allowed":"pointer"}}
                        >
                          Buy YES
                        </button>
                        <button 
                          disabled={busy||typed<=0||!Number.isFinite(costNo)} 
                          onClick={()=>buy(pk,a,"no")}
                          style={{padding:"6px 12px",background:busy||typed<=0?"#9ca3af":"#ef4444",color:"white",border:"none",borderRadius:"4px",cursor:busy||typed<=0?"not-allowed":"pointer"}}
                        >
                          Buy NO
                        </button>
                      </div>
                    )}

                    {/* Expired market info */}
                    {expired && !resolved && !activity && (
                      <div style={{marginTop:8,padding:"8px",background:"rgba(251, 191, 36, 0.1)",border:"1px solid rgba(251, 191, 36, 0.2)",borderRadius:"4px",fontSize:"14px"}}>
                        ⏰ Market expired - Oracle will resolve automatically
                      </div>
                    )}

                    {/* claim */}
                    {resolved && (
                      <button 
                        style={{marginTop:8,background:"#10b981",color:"#fff",border:"none",padding:"8px 16px",borderRadius:"4px",cursor:"pointer",fontSize:"14px"}} 
                        onClick={()=>claim(pk,a)}
                      >
                        💰 Claim Rewards
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Oracle info box */}
        <div style={{
          background: "rgba(99, 102, 241, 0.1)", 
          border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: "12px", 
          padding: "16px", 
          marginTop: "24px",
          fontSize: "14px",
          color: "#1f2937"
        }}>
     <strong>💰 How Rewards Work:</strong> Winners receive proportional shares of the vault balance, not 1:1 token ratios. 
            Your payout = (your winning tokens ÷ total winning tokens) × vault balance. This ensures fair distribution based on actual market activity and follows industry standards used by major prediction markets.
          </div>

          {/* Oracle System Info */}
          <div style={{
            background: "rgba(99, 102, 241, 0.1)", 
            border: "1px solid rgba(99, 102, 241, 0.2)",
            borderRadius: "12px", 
            padding: "16px", 
            fontSize: "14px",
            color: "#1f2937"
          }}>
            <strong>🔮 AI Oracle System:</strong> Markets resolve automatically when expired using AI analysis. 
            No manual intervention needed - the AI analyzes each question and determines the correct outcome based on available information!
          </div>
      </main>
    </div>
  );
}

/* wrapper (unchanged) */
export default function App() {
  const wallets = useMemo(()=>[new PhantomWalletAdapter()],[]);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Main />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}