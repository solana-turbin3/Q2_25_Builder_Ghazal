use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Mint, MintTo, Token, TokenAccount, Transfer},
};

use crate::{
    errors::SomeError,
    events::OutcomeBought,
    state::{MarketState, OutcomeSide},
    utils::lmsr::{checked_fee_amount, lmsr_buy_cost, safe_f64_to_u64},
};

#[derive(Accounts)]
pub struct BuyOutcome<'info> {
    /* Market PDA ------------------------------------------------ */
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref(), &market.seed.to_le_bytes()],
        bump  = market.bump
    )]
    pub market: Account<'info, MarketState>,

    /* --- USDC -------------------------------------------------- */
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>, // payer
    /// CHECK: official USDC mint (needed only for ATA constraint)
    pub usdc_mint: Account<'info, Mint>,

    /* Vault ATA (derive-on-the-fly, must be mut for transfers) -- */
    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_account: Account<'info, TokenAccount>, // fee sink

    /* Outcome token handling ----------------------------------- */
    #[account(mut)]
    pub user_outcome_account: Account<'info, TokenAccount>, // receives YES/NO
    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,
    #[account(mut)]
    pub no_mint:  Account<'info, Mint>,

    /* Signers & programs --------------------------------------- */
    #[account(signer)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> BuyOutcome<'info> {
    pub fn buy_outcome(
        &mut self,
        outcome_side: OutcomeSide,
        delta_shares: u64,
    ) -> Result<()> {
        /* ----- 1. Update market & compute cost/fee --------------- */
        let (bump, auth, cost_u64, fee_u64, total_paid) = {
            let clock = Clock::get()?;

            require!(clock.unix_timestamp < self.market.expiry_timestamp, SomeError::MarketExpired);
            require!(!self.market.resolved, SomeError::MarketAlreadyResolved);

            /* LMSR cost ------------------------------------------- */
            let b_val_f = self.market.b_value_scaled as f64 / 1_000_000_f64;
            let raw_cost = lmsr_buy_cost(
                b_val_f,
                self.market.yes_shares,
                self.market.no_shares,
                outcome_side == OutcomeSide::Yes,
                delta_shares,
            )?;
            let cost = safe_f64_to_u64(raw_cost)?;
            let fee = checked_fee_amount(cost, self.market.fee_bps as u64)?;
            let tot = cost.checked_add(fee).ok_or(SomeError::MathError)?;

            /* Update share totals --------------------------------- */
            if outcome_side == OutcomeSide::Yes {
                self.market.yes_shares = self.market.yes_shares.checked_add(delta_shares).ok_or(SomeError::MathError)?;
            } else {
                self.market.no_shares = self.market.no_shares.checked_add(delta_shares).ok_or(SomeError::MathError)?;
            }

            (self.market.bump, self.market.authority, cost, fee, tot)
        };

        /* ----- 2. USDC transfers --------------------------------- */
        if fee_u64 > 0 {
            token::transfer(
                CpiContext::new(
                    self.token_program.to_account_info(),
                    Transfer {
                        from:      self.user_usdc_account.to_account_info(),
                        to:        self.treasury_account.to_account_info(),
                        authority: self.user.to_account_info(),
                    },
                ),
                fee_u64,
            )?;
        }
        if cost_u64 > 0 {
            token::transfer(
                CpiContext::new(
                    self.token_program.to_account_info(),
                    Transfer {
                        from:      self.user_usdc_account.to_account_info(),
                        to:        self.vault.to_account_info(),
                        authority: self.user.to_account_info(),
                    },
                ),
                cost_u64,
            )?;
        }

        /* ----- 3. Mint YES / NO tokens --------------------------- */
        let signer_seeds: &[&[u8]] = &[
            b"market",
            auth.as_ref(),
            &self.market.seed.to_le_bytes(),
            &[bump],
        ];

        let mint_ai = match outcome_side {
            OutcomeSide::Yes => self.yes_mint.to_account_info(),
            OutcomeSide::No  => self.no_mint .to_account_info(),
        };

        token::mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                MintTo {
                    mint:      mint_ai,
                    to:        self.user_outcome_account.to_account_info(),
                    authority: self.market.to_account_info(),
                },
                &[signer_seeds],
            ),
            delta_shares,
        )?;

        /* ----- 4. Emit event ------------------------------------- */
        emit!(OutcomeBought {
            market:     self.market.key(),
            buyer:       self.user.key(),
            outcome_side,
            total_paid,
            fee_amount:  fee_u64,
            net_staked:  cost_u64,
        });

        Ok(())
    }
}