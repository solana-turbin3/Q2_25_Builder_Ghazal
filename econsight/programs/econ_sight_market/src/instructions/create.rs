use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::Market;

#[derive(Accounts)]
#[instruction(question: String, expiry_timestamp: i64)]
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
    pub yes_mint: Account<'info, Mint>,//The market creates brand-new SPL mints for “YES” and “NO” outcome tokens.in AMM mint_x and mint_y are already-existing tokens (e.g., USDC & SOL)

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
    pub vault: Account<'info, TokenAccount>,//unlike in AMM, here vault is not an ATA, it's named PDA for easy look-ups: “give me ['vault', market].” (in amm (config, mint_x))

    /// CHECK: reference to official USDC mint (we won't create USDC mint ourselves)
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
) -> Result<()> {
    let market_account = &mut ctx.accounts.market;

    market_account.question = question;
    market_account.expiry_timestamp = expiry_timestamp;
    market_account.yes_mint = ctx.accounts.yes_mint.key();
    market_account.no_mint = ctx.accounts.no_mint.key();
    market_account.vault = ctx.accounts.vault.key();
    market_account.authority = ctx.accounts.user.key();
    market_account.resolved = false;
    market_account.winner = None;

    // Store the PDA bump so we can re-derive and sign later
    let bump = ctx.bumps.market;


    market_account.bump = bump;

    Ok(())
}
