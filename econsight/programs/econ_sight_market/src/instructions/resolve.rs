use anchor_lang::prelude::*;

use crate::state::{Market, OutcomeSide};
use crate::errors::SomeError; 

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        mut,
        has_one = authority  // This references the field below
    )]
    pub market: Account<'info, Market>,

    /// CHECK: This is the market authority. We only need its signature to match `market.authority`.
    /// We are not reading or writing its account data.
    #[account(signer)]
    pub authority: AccountInfo<'info>,

    /// CHECK: For MVP, a signer acting as the "oracle" or real data feed
    pub oracle_authority: Signer<'info>,
}

pub fn resolve_market(ctx: Context<ResolveMarket>) -> Result<()> {
    let market_account = &mut ctx.accounts.market;

    // For MVP, let's say the oracle authority calls the function & picks winner
    // In production, you'd read from an on-chain feed (Chainlink, Switchboard)
    // or pass in the indicator result, e.g. "PMI was 52 => outcome = Yes"

    require!(!market_account.resolved, SomeError::MarketAlreadyResolved);

    // Hardcode for demonstration
    market_account.winner = Some(OutcomeSide::Yes);
    market_account.resolved = true;

    Ok(())
}
