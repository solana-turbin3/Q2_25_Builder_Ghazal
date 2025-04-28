use anchor_lang::prelude::*;

#[account]
pub struct Market {
    pub question: String,
    pub expiry_timestamp: i64,
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub vault: Pubkey,        // Collateral USDC vault
    pub authority: Pubkey,    // Market creator
    pub resolved: bool,
    pub winner: Option<OutcomeSide>,
    pub bump: u8,

    // NEW FIELDS for second MVP
    pub fee_bps: u16,         // e.g., 100 = 1% fee
    pub treasury: Pubkey,     // Fee destination token account
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum OutcomeSide {
    Yes,
    No,
}
