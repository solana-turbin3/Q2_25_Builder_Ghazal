// programs/econ_sight_market/src/lib.rs
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub use instructions::*;
pub mod errors;
use crate::state::{Market, OutcomeSide};
// program ID
declare_id!("4n3PUjjcH54EpLfH3qbKofM2G5dGAYcpXo4vbeX3769a");

#[program]
pub mod econ_sight_market {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        expiry_timestamp: i64,
    ) -> Result<()> {
        crate::create::create_market(ctx, question, expiry_timestamp)
    }

    pub fn buy_outcome(
        ctx: Context<BuyOutcome>,
        outcome_side: OutcomeSide,
        amount: u64,
    ) -> Result<()> {
        crate::purchase_outcome::buy_outcome(ctx, outcome_side, amount)
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>) -> Result<()> {
        crate::resolve::resolve_market(ctx)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        crate::claim_rewards::claim_rewards(ctx)
    }
} // ← no trailing comma
