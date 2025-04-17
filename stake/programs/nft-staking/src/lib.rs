
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

declare_id!("918pPowRNGe8caeu8v8BEBEB5z4H7mACXoEcjbZEHFBj");

pub mod contexts;
pub mod error;
pub mod state;

pub use contexts::*;
pub use state::*;

#[program]
pub mod staking {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        points_per_stake: u8,
        max_stake: u8,
        freeze_period: u32,
    ) -> Result<()> {
        ctx.accounts
            .init(points_per_stake, max_stake, freeze_period, &ctx.bumps)
    }

    pub fn initialize_user(ctx: Context<RegisterUser>) -> Result<()> {
        ctx.accounts.init(&ctx.bumps)
    }

    pub fn stake(ctx: Context<Stake>) -> Result<()> {
        ctx.accounts.stake(&ctx.bumps)
    }
}