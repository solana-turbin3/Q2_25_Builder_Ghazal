// programs/econ_sight_market/src/instructions/purchase_outcome.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, MintTo};
use crate::state::{MarketState, OutcomeSide};
use crate::errors::SomeError;
use crate::events::OutcomeBought;
use crate::utils::lmsr::{lmsr_buy_cost, safe_f64_to_u64, checked_fee_amount};

#[derive(Accounts)]
pub struct BuyOutcome<'info> {
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref()],
        bump  = market.bump
    )]
    pub market: Account<'info, MarketState>,

    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,   // owned by user
    #[account(mut)]
    pub vault:            Account<'info, TokenAccount>,    // owned by market PDA
    #[account(mut)]
    pub treasury_account: Account<'info, TokenAccount>,    // fee destination

    #[account(mut)]
    pub user_outcome_account: Account<'info, TokenAccount>, // receives YES / NO
    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,
    #[account(mut)]
    pub no_mint:  Account<'info, Mint>,

    #[account(signer)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn buy_outcome(
    ctx: Context<BuyOutcome>,
    outcome_side: OutcomeSide,
    delta_shares: u64,
) -> Result<()> {
    /* ── 1. mutate `market`; calculate cost & fee ──────────────── */
    let (bump, auth, cost_u64, fee_u64, total_paid) = {
        let clock  = Clock::get()?;
        let market = &mut ctx.accounts.market;

        require!(clock.unix_timestamp < market.expiry_timestamp, SomeError::MarketExpired);
        require!(!market.resolved,                             SomeError::MarketAlreadyResolved);

        // LMSR cost = C(q_after) − C(q_before)
        let b_val_f  = market.b_value_scaled as f64 / 1_000_000_f64;
        let raw_cost = lmsr_buy_cost(
            b_val_f,
            market.yes_shares,
            market.no_shares,
            outcome_side == OutcomeSide::Yes,
            delta_shares,
        );
        let cost = safe_f64_to_u64(raw_cost)?;
        let fee  = checked_fee_amount(cost, market.fee_bps as u64)?;
        let tot  = cost.checked_add(fee).ok_or(SomeError::MathError)?;

        // update share totals
        if outcome_side == OutcomeSide::Yes {
            market.yes_shares = market.yes_shares.checked_add(delta_shares).ok_or(SomeError::MathError)?;
        } else {
            market.no_shares  = market.no_shares .checked_add(delta_shares).ok_or(SomeError::MathError)?;
        }

        (market.bump, market.authority, cost, fee, tot)
    };

    /* ── 2. USDC transfers (payer = user) ──────────────────────── */
    if fee_u64 > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.user_usdc_account.to_account_info(),
                    to:        ctx.accounts.treasury_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            fee_u64,
        )?;
    }
    if cost_u64 > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.user_usdc_account.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            cost_u64,
        )?;
    }

    /* ── 3. Mint outcome tokens (1 token = 1 µUSDC redemption) ─── */
    let bump_slice: &[u8] = &[bump];
    let signer_seeds: &[&[u8]] = &[b"market", auth.as_ref(), bump_slice];

    let mint_ai = match outcome_side {
        OutcomeSide::Yes => ctx.accounts.yes_mint.to_account_info(),
        OutcomeSide::No  => ctx.accounts.no_mint .to_account_info(),
    };

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint:      mint_ai,
                to:        ctx.accounts.user_outcome_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
            },
            &[signer_seeds],
        ),
        delta_shares,          // ✅ mint *shares*, not cost
    )?;

    /* ── 4. Emit event ─────────────────────────────────────────── */
    emit!(OutcomeBought {
        market:      ctx.accounts.market.key(),
        buyer:       ctx.accounts.user.key(),
        outcome_side,
        total_paid,
        fee_amount:  fee_u64,
        net_staked:  cost_u64,
    });

    Ok(())
}
