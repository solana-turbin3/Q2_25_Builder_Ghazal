#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;
mod utils;

use instructions::*;
use state::{MarketState, OutcomeSide};

// Program ID
declare_id!("HNBosxTmZSjq7pwVEeqx5sEkAuwNroG2JWzvAnQYrRuy");

#[program]
pub mod econ_sight_market {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        expiry_timestamp: i64,
        fee_bps: u16,
        treasury: Pubkey,
        b_value_scaled: u64,  
    ) -> Result<()> {
        let default_b = 1_000_000u64;
        create::create_market(ctx, question, expiry_timestamp, fee_bps, treasury, b_value_scaled)
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
