use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use crate::state::{Market, OutcomeSide};

#[derive(Accounts)]
pub struct BuyOutcome<'info> {
    #[account(
        mut,
        seeds = [
            b"market",
            market.authority.as_ref()
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    // The user pays USDC from their token account
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,

    // The vault belongs to the market
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    // The user needs a token account for whichever side they buy
    #[account(mut)]
    pub user_outcome_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,
    #[account(mut)]
    pub no_mint: Account<'info, Mint>,

    #[account(signer)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn buy_outcome(
    ctx: Context<BuyOutcome>,
    outcome_side: OutcomeSide,
    amount: u64,
) -> Result<()> {
    // 1. Transfer USDC from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // For simplicity, 1:1 ratio => 1 USDC = 1 outcome token
    let tokens_to_mint = amount;

    // 2. Mint outcome tokens to the user's outcome account
    let market = &ctx.accounts.market;
    let seeds = &[
        b"market",
        market.authority.as_ref(),
        &[market.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let mint_key = match outcome_side {
        OutcomeSide::Yes => ctx.accounts.yes_mint.to_account_info(),
        OutcomeSide::No => ctx.accounts.no_mint.to_account_info(),
    };

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: mint_key,
                to: ctx.accounts.user_outcome_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            signer_seeds,
        ),
        tokens_to_mint,
    )?;

    Ok(())
}
