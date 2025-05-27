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
declare_id!("68CF4Pu8HGRoeSkTPNyTgC4iE5DmG4q8DZSrRmrEeeck");

#[program]
pub mod econsightmarket2 {
    use super::*;

pub fn create_market(
    ctx: Context<CreateMarket>,
    seed:            u64,
    question:        String,
    expiry_ts:       i64,
    fee_bps:         u16,
    treasury:        Pubkey,
    b_value_scaled:  u64,
) -> Result<()> {
    ctx.accounts.build(
        seed,
        question,
        expiry_ts,
        fee_bps,
        treasury,
        b_value_scaled,
        ctx.bumps,
    )
}

    pub fn buy_outcome(
        ctx: Context<BuyOutcome>,
        outcome_side: OutcomeSide,
        amount: u64,
    ) -> Result<()> {
        ctx.accounts.buy_outcome(outcome_side, amount)
    }

     pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        winner_side: OutcomeSide
    ) -> Result<()> {
        ctx.accounts.resolve_market( winner_side)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
       ctx.accounts.claim_rewards()
    }
}
