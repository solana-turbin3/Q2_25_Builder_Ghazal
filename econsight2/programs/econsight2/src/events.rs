use anchor_lang::prelude::*;
use crate::state::OutcomeSide;

#[event]
pub struct MarketCreated {
    pub market_key: Pubkey,
    pub question: String,
    pub expiry_timestamp: i64,
    pub fee_bps: u16,
    pub treasury: Pubkey,
}

#[event]
pub struct OutcomeBought {
    pub market: Pubkey,
    pub buyer: Pubkey,
    pub outcome_side: OutcomeSide,
    pub total_paid: u64,
    pub fee_amount: u64,
    pub net_staked: u64,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub winner_side: OutcomeSide,
    pub resolved_at: i64,
}
