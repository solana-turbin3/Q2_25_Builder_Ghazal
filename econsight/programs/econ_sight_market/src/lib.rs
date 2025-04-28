#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

use instructions::*;
use state::{Market, OutcomeSide};

// Program ID
declare_id!("4n3PUjjcH54EpLfH3qbKofM2G5dGAYcpXo4vbeX3769a");

#[program]
pub mod econ_sight_market {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        expiry_timestamp: i64,
        fee_bps: u16,
        treasury: Pubkey,
    ) -> Result<()> {
        create::create_market(ctx, question, expiry_timestamp, fee_bps, treasury)
    }

    pub fn buy_outcome(
        ctx: Context<BuyOutcome>,
        outcome_side: OutcomeSide,
        amount: u64,
    ) -> Result<()> {
        purchase_outcome::buy_outcome(ctx, outcome_side, amount)
    }

    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        winner_side: OutcomeSide
    ) -> Result<()> {
        resolve::resolve_market(ctx, winner_side)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        claim_rewards::claim_rewards(ctx)
    }
}
