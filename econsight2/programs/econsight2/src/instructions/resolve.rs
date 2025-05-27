use anchor_lang::prelude::*;
use crate::state::{MarketState, OutcomeSide};
use crate::errors::SomeError;
use crate::events::MarketResolved;

#[derive(Accounts)]

pub struct ResolveMarket<'info> {
    #[account(
        mut,
        seeds  = [b"market", authority.key().as_ref(), &market.seed.to_le_bytes()],
        bump = market.bump,
        has_one = authority
    )]
    pub market: Account<'info, MarketState>,

  
   pub authority: Signer<'info>,

}
impl<'info> ResolveMarket<'info> {
pub fn resolve_market(
    &mut self,
    winner_side: OutcomeSide
) -> Result<()> {
    //let market_account = &mut ctx.accounts.market;

    // Check that the market is not already resolved
    require!(
        !self.market.resolved,
        SomeError::MarketAlreadyResolved
    );

    // Check that we are past expiry
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time >= self.market.expiry_timestamp,
        SomeError::MarketNotExpiredYet
    );

    // Set the winner
    self.market.winner = Some(winner_side);
    self.market.resolved = true;

    // Emit event for front-end
    emit!(MarketResolved {
        market: self.market.key(),
        winner_side,
        resolved_at: current_time,
    });

    Ok(())
}
}