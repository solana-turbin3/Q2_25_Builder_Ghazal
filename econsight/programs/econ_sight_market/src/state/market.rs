use anchor_lang::prelude::*;

#[account]
//#[derive(InitSpace)]
pub struct Market {
    pub question: String,
    pub expiry_timestamp: i64,
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub vault: Pubkey,      // an SPL token account holding USDC collateral//The USDC vault is derived from [b"vault", market.key()] + bump
    pub authority: Pubkey,  // market creator
    pub resolved: bool,
    pub winner: Option<OutcomeSide>, // None if not resolved, Some(Yes/No) if resolved
    pub bump: u8
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum OutcomeSide {
    Yes,
    No,
}