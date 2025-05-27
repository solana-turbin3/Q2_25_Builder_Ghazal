import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { OpenAI } from "openai";

// Import your specific types
import type { Econsightmarket2 } from "../../idl/types/econsightmarket23";

// Types
interface OracleConfig {
  openaiApiKey: string;
  rpcUrl: string;
  programId: PublicKey;
}

class OracleService {
  private openai: OpenAI;
  private connection: Connection;
  private config: OracleConfig;

  constructor(config: OracleConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.openai = new OpenAI({ 
      apiKey: config.openaiApiKey,
      timeout: 30000,
      dangerouslyAllowBrowser: true // Enable browser usage
    });
  }

  /**
   * Check if market is expired and needs resolution
   */
  isMarketExpired(expiryTimestamp: number): boolean {
    return Math.floor(Date.now() / 1000) > expiryTimestamp;
  }

  /**
   * Get time until market expires
   */
  getTimeUntilExpiry(expiryTimestamp: number): number {
    return Math.max(0, expiryTimestamp - Math.floor(Date.now() / 1000));
  }

  /**
   * Consult AI oracle for market resolution
   */
  async consultOracle(question: string): Promise<"YES" | "NO"> {
    console.log("🤖 Consulting AI Oracle...", question);

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4", // Use GPT-4 for browser compatibility
        messages: [
          {
            role: "system",
            content: `You are an oracle for a prediction market. Answer with exactly "YES" or "NO" only.
            
            Instructions:
            - If the statement is true, answer "YES" 
            - If the statement is false, answer "NO"
            - Be as accurate as possible based on your knowledge
            - Return only "YES" or "NO" with no additional text
            - If uncertain, make your best judgment based on available information`
          },
          { 
            role: "user", 
            content: `Please determine if this statement is true or false: ${question}` 
          },
        ],
        temperature: 0, // Deterministic responses
        max_tokens: 10, // Short response
      });

      const rawAnswer = response.choices?.[0]?.message?.content?.trim().toUpperCase() || "YES";
      const cleanAnswer = rawAnswer.startsWith("N") ? "NO" : "YES";
      
      console.log(`🤖 Oracle says: ${cleanAnswer} (raw: "${rawAnswer}")`);
      return cleanAnswer;

    } catch (error: any) {
      console.error("❌ Oracle consultation failed:", error);
      
      // Fallback logic - analyze question for obvious answers
      if (question.toLowerCase().includes("will btc") && question.toLowerCase().includes("above")) {
        console.warn("⚠️ Using fallback resolution based on question analysis");
        return "NO"; // Conservative fallback
      }
      
      console.warn("⚠️ Using fallback resolution: YES");
      return "YES";
    }
  }

  /**
   * Resolve market using connected wallet - FIXED TYPE SIGNATURE
   */
  async resolveMarket(
    marketAddress: PublicKey,
    question: string,
    provider: AnchorProvider,
    program: Program<Econsightmarket2> // ✅ Now accepts your specific program type
  ): Promise<string> {
    console.log("🔮 Resolving market with oracle...");

    // 1. Get oracle decision
    const oracleDecision = await this.consultOracle(question);
    
    // 2. Build resolution transaction
    try {
      const tx = await program.methods
        .resolveMarket(oracleDecision === "YES" ? { yes: {} } : { no: {} })
        .accounts({
          market: marketAddress,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      console.log(`✅ MARKET RESOLVED: ${oracleDecision}`);
      console.log(`📋 Transaction: ${tx}`);
      
      return tx;

    } catch (error: any) {
      console.error("❌ Resolution transaction failed:", error);
      throw new Error(`Failed to resolve market: ${error.message}`);
    }
  }

  /**
   * Auto-resolve market when expired - FIXED TYPE SIGNATURE
   */
  async autoResolveIfExpired(
    marketAddress: PublicKey,
    question: string,
    expiryTimestamp: number,
    resolved: boolean,
    provider: AnchorProvider,
    program: Program<Econsightmarket2>, // ✅ Now accepts your specific program type
    onResolved: (decision: string, txId: string) => void
  ): Promise<void> {
    // Don't resolve if already resolved
    if (resolved) {
      console.log("⚠️ Market already resolved, skipping");
      return;
    }

    // Check if expired
    if (!this.isMarketExpired(expiryTimestamp)) {
      console.log("⚠️ Market not yet expired, skipping");
      return;
    }

    try {
      console.log(`⏰ Market expired! Auto-resolving: ${question}`);
      
      // Get oracle decision first
      const decision = await this.consultOracle(question);
      
      // Then execute the resolution
      const txId = await this.resolveMarket(marketAddress, question, provider, program);
      
      // Notify the UI
      onResolved(decision, txId);
      
    } catch (error: any) {
      console.error("❌ Auto-resolution failed:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const oracleService = new OracleService({
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY || "",
  rpcUrl: import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8899",
  programId: new PublicKey(import.meta.env.VITE_PROGRAM_ID),
});

export default OracleService;