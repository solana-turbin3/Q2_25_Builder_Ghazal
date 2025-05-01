// src/state/market.rs
use anchor_lang::prelude::*;

#[account]
pub struct MarketState{
    pub question: String,
    pub expiry_timestamp: i64,
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub resolved: bool,
    pub winner: Option<OutcomeSide>,
    pub bump: u8,

    // Fees
    pub fee_bps: u16,
    pub treasury: Pubkey,

    // NEW FIELDS for LMSR
    // We'll store the total minted shares in each outcome
    pub yes_shares: u64,   // how many "Yes" tokens minted so far
    pub no_shares: u64,    // how many "No" tokens minted so far

    // The "b" parameter for LMSR (in some scaled integer form).
    // For simplicity, let's store as an integer representing 1e6 * real bVal
    // e.g. if bVal = 10 => store 10_000000
    pub b_value_scaled: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum OutcomeSide {
    Yes,
    No,
}
