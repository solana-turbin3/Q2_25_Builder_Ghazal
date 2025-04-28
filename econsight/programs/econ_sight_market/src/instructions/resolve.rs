use anchor_lang::prelude::*;
use crate::state::{Market, OutcomeSide};
use crate::errors::SomeError;
use crate::events::MarketResolved;

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub market: Account<'info, Market>,

    /// CHECK: This is the market authority. We only need its signature
    #[account(signer)]
    pub authority: AccountInfo<'info>,

    /// CHECK: For MVP, this can be a second authority or oracle. 
    /// In production, you'd likely pass data or require an on-chain feed.
    pub oracle_authority: Signer<'info>,
}

pub fn resolve_market(
    ctx: Context<ResolveMarket>,
    winner_side: OutcomeSide
) -> Result<()> {
    let market_account = &mut ctx.accounts.market;

    // Check that the market is not already resolved
    require!(
        !market_account.resolved,
        SomeError::MarketAlreadyResolved
    );

    // Check that we are past expiry
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time >= market_account.expiry_timestamp,
        SomeError::MarketNotExpiredYet
    );

    // Set the winner
    market_account.winner = Some(winner_side);
    market_account.resolved = true;

    // Emit event for front-end
    emit!(MarketResolved {
        market: market_account.key(),
        winner_side,
        resolved_at: current_time,
    });

    Ok(())
}
