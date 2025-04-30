// src/instructions/create.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::Market;
use crate::events::MarketCreated;
use crate::errors::SomeError;

#[derive(Accounts)]
#[instruction(
    question: String,
    expiry_timestamp: i64,
    fee_bps: u16,
    treasury: Pubkey,
    b_value_scaled: u64
)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = user,
        seeds = [
            b"market",
            user.key().as_ref()
        ],
        bump,
        space = 8 + 512
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = user,
        seeds = [b"yes_mint", market.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = market
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = user,
        seeds = [b"no_mint", market.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = market
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = user,
        seeds = [b"vault", market.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: reference to official USDC mint
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}


pub fn create_market(
    ctx: Context<CreateMarket>,
    question: String,
    expiry_timestamp: i64,
    fee_bps: u16,
    treasury: Pubkey,
    b_value_scaled: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        expiry_timestamp > current_time,
        SomeError::MarketExpired
    );

    let market_account = &mut ctx.accounts.market;
    let bump = ctx.bumps.market;

    // Basic fields
    market_account.question = question;
    market_account.expiry_timestamp = expiry_timestamp;
    market_account.yes_mint = ctx.accounts.yes_mint.key();
    market_account.no_mint = ctx.accounts.no_mint.key();
    market_account.vault = ctx.accounts.vault.key();
    market_account.authority = ctx.accounts.user.key();
    market_account.resolved = false;
    market_account.winner = None;
    market_account.bump = bump;

    // Fee
    market_account.fee_bps = fee_bps;
    market_account.treasury = treasury;

    // LMSR fields
    market_account.yes_shares = 0;
    market_account.no_shares = 0;
    market_account.b_value_scaled = b_value_scaled;

    emit!(MarketCreated {
        market_key: market_account.key(),
        question: market_account.question.clone(),
        expiry_timestamp: market_account.expiry_timestamp,
        fee_bps,
        treasury,
    });

    Ok(())
}
