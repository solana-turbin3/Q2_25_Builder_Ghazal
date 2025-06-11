
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

mod instructions;
mod state;

use instructions::*;

declare_id!("2T48SCU6YrN2bptD59KYoFsB9QbWayR2mLxZtJwQkSBE");

#[program]
pub mod amm {
    use crate::instruction::Withdraw;

    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        seed: u64,
        fees: u16,
        authority: Option<Pubkey>,
    ) -> Result<()> {
        ctx.accounts.init(seed, fees, authority, ctx.bumps)?;
        Ok(())
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        max_x: u64,
        max_y: u64,
    ) -> Result<()> {
        ctx.accounts.deposit(amount, max_x, max_y)
    }
    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        min_out:  u64,
        is_x_to_y: bool,
    ) -> Result<()> {
        ctx.accounts.process(amount_in, min_out, is_x_to_y)
    }
     pub fn withdraw(
        ctx: Context<Withdraw>,
        lp_amount: u64,
        min_x:  u64,
        min_y: u64,
    ) -> Result<()> {
        ctx.accounts.withdraw(lp_amount, min_x,min_y)
    }
}
