use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use crate::state::{Market, OutcomeSide};
use crate::errors::SomeError;
use crate::events::OutcomeBought;

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

    /// The user pays USDC from their token account
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,

    /// The vault belongs to the market
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    /// The token account that receives fees
    /// Must match `market.treasury`
    #[account(
        mut,
        address = market.treasury
    )]
    pub treasury_account: Account<'info, TokenAccount>,

    /// The user’s outcome token account (for either yes_mint or no_mint)
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
    let market = &ctx.accounts.market;

    // 1. Check if market is still active (not past expiry)
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time < market.expiry_timestamp,
        SomeError::MarketExpired
    );

    // 2. Check if user has enough USDC (optional, but clearer)
    require!(
        ctx.accounts.user_usdc_account.amount >= amount,
        SomeError::InsufficientFunds
    );

    // 3. Calculate fee + net
    let fee_bps = market.fee_bps as u64;
    let fee_amount = (amount * fee_bps) / 10_000; // e.g. if fee_bps=100 => 1% fee
    let net_amount = amount
        .checked_sub(fee_amount)
        .ok_or(SomeError::MathError)?;

    // 4. Transfer fee to treasury
    if fee_amount > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.user_usdc_account.to_account_info(),
                    to: ctx.accounts.treasury_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            fee_amount,
        )?;
    }

    // 5. Transfer net_amount to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        net_amount,
    )?;

    // For simplicity, minted outcome tokens = net_amount (1:1 after fee).
    let tokens_to_mint = net_amount;

    // 6. Mint outcome tokens to the user’s outcome account
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

    // Emit event for front-end
    emit!(OutcomeBought {
        market: market.key(),
        buyer: ctx.accounts.user.key(),
        outcome_side,
        total_paid: amount,
        fee_amount,
        net_staked: net_amount,
    });

    Ok(())
}
