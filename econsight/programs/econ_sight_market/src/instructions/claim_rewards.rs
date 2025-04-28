use anchor_lang::prelude::*;
use anchor_spl::token::{
    self, Token, TokenAccount, Mint, Transfer, Burn,
};
use crate::state::{Market, OutcomeSide};
use crate::errors::SomeError; // Adjust if your errors are local or inline

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        mut,
        seeds = [
            b"market",
            market.authority.as_ref()
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    // The user must have a "winning token" account
    #[account(mut)]
    pub user_outcome_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,

    // Both possible mints
    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,
    #[account(mut)]
    pub no_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    #[account(signer)]
    pub user: Signer<'info>,
}

pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
    let market = &ctx.accounts.market;
    require!(market.resolved, SomeError::MarketNotResolved);

    // Determine the winning side
    let winning_side = market.winner.ok_or(SomeError::NoWinnerYet)?;
    let user_mint = ctx.accounts.user_outcome_account.mint;
    if winning_side == OutcomeSide::Yes && user_mint != market.yes_mint {
        return Err(SomeError::WrongSide.into());
    }
    if winning_side == OutcomeSide::No && user_mint != market.no_mint {
        return Err(SomeError::WrongSide.into());
    }

    // The user's balance of winning tokens
    let user_tokens_balance = ctx.accounts.user_outcome_account.amount;

    // Use "market" (PDA) to sign the vault transfer
    let seeds = &[
        b"market",
        market.authority.as_ref(),
        &[market.bump],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_usdc_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            &[&seeds[..]],
        ),
        user_tokens_balance,
    )?;

    // Burn the user's winning outcome tokens
    let mint_account = if winning_side == OutcomeSide::Yes {
        &ctx.accounts.yes_mint
    } else {
        &ctx.accounts.no_mint
    };
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: mint_account.to_account_info(),
                from: ctx.accounts.user_outcome_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        user_tokens_balance,
    )?;

    Ok(())
}
