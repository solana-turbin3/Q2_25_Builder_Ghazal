use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{errors::SomeError, events::MarketCreated, state::MarketState};

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct CreateMarket<'info> {
    /* ------------- PDA that owns everything else ------------- */
    #[account(
        init,
        payer  = user,
        seeds  = [b"market", user.key().as_ref(), &seed.to_le_bytes()],
        bump,
        space  = 8 + MarketState::INIT_SPACE,
    )]
    pub market: Account<'info, MarketState>,

    /* YES / NO mints (authority = market PDA) ------------------ */
    #[account(
        init,
        payer  = user,
        seeds  = [b"yes_mint", market.key().as_ref()],
        bump,
        mint::decimals  = 6,
        mint::authority = market,
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        init,
        payer  = user,
        seeds  = [b"no_mint", market.key().as_ref()],
        bump,
        mint::decimals  = 6,
        mint::authority = market,
    )]
    pub no_mint: Account<'info, Mint>,

    /* Deterministic vault ATA ---------------------------------- */
    #[account(
        init,
        payer                 = user,
        associated_token::mint      = usdc_mint,
        associated_token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: official USDC mint on the cluster
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program:           Program<'info, System>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> CreateMarket<'info> {
    pub fn build(
        &mut self,
        seed:            u64,
        question:        String,
        expiry_ts:       i64,
        fee_bps:         u16,
        treasury:        Pubkey,
        b_value_scaled:  u64,
        bumps:           CreateMarketBumps,
    ) -> Result<()> {
        /* Guard: future-dated expiry --------------------------- */
        require!(expiry_ts > Clock::get()?.unix_timestamp, SomeError::MarketExpired);

        /* Populate account (note: **no vault field**) ---------- */
        self.market.set_inner(MarketState {
            seed,
            bump: bumps.market,
            authority: self.user.key(),
            question:  question.clone(),
            expiry_timestamp: expiry_ts,
            yes_mint: self.yes_mint.key(),
            no_mint:  self.no_mint.key(),
            resolved: false,
            winner:   None,
            fee_bps,
            treasury,
            yes_shares: 0,
            no_shares:  0,
            b_value_scaled,
        });

        emit!(MarketCreated {
            market_key: self.market.key(),
            question,
            expiry_timestamp: expiry_ts,
            fee_bps,
            treasury,
        });
        Ok(())
    }
}