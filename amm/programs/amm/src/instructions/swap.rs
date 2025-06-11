use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Transfer, Token, TokenAccount, Mint},
};
use constant_product_curve::ConstantProduct;           // or your own math lib

use crate::state::Config;

/* -------------------------------------------------------------------------- */
/*                                Account ctx                                 */
/* -------------------------------------------------------------------------- */
#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    // Config PDA =
    //   seeds = ["config", seed.to_le_bytes()]
    #[account(
        seeds  = [b"config", config.seed.to_le_bytes().as_ref()],
        bump   = config.config_bump,
        has_one = mint_x,
        has_one = mint_y
    )]
    pub config: Account<'info, Config>,

    pub mint_x: Account<'info, Mint>,
    pub mint_y: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = config,
    )]
    pub vault_x: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = config,
    )]
    pub vault_y: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = user,
    )]
    pub user_x: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = user,
    )]
    pub user_y: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/* -------------------------------------------------------------------------- */
/*                                   Logic                                    */
/* -------------------------------------------------------------------------- */
impl<'info> Swap<'info> {
    pub fn process(
        &mut self,
        amount_in: u64,
        min_out:   u64,
        is_x_to_y: bool,
    ) -> Result<()> {
        /* -------- 1. move input tokens to vault -------------------------- */
        if is_x_to_y {
            self.transfer_in(&self.user_x, &self.vault_x, amount_in)?;
        } else {
            self.transfer_in(&self.user_y, &self.vault_y, amount_in)?;
        }

        /* -------- 2. constant-product pricing ---------------------------- */
        let (x_bal, y_bal) = (self.vault_x.amount as u128, self.vault_y.amount as u128);
        let k              = x_bal.checked_mul(y_bal).ok_or(ErrorCode::MathOverflow)?;

        // fee (basis-points, e.g. 30 = 0.3 %)
        let fee_bps = self.config.fees as u128;
        let amount_in_u128 = amount_in as u128;
        let amount_in_after_fee =
            amount_in_u128.checked_mul(10_000 - fee_bps).ok_or(ErrorCode::MathOverflow)? / 10_000;

        // treat X → Y as canonical; if Y → X, swap balances for math
        let (mut in_bal, mut out_bal) = (x_bal, y_bal);
        if !is_x_to_y {
            core::mem::swap(&mut in_bal, &mut out_bal);
        }

        // new invariant
        let new_in  = in_bal.checked_add(amount_in_after_fee).ok_or(ErrorCode::MathOverflow)?;
        let new_out = k.checked_div(new_in).ok_or(ErrorCode::MathOverflow)?;
        let out_amt = out_bal.checked_sub(new_out).ok_or(ErrorCode::MathOverflow)?;

        /* -------- 3. slippage guard -------------------------------------- */
        require!(out_amt as u64 >= min_out, ErrorCode::SlippageTooHigh);

        /* -------- 4. pay user -------------------------------------------- */
        let out_u64 = out_amt as u64;
        if is_x_to_y {
            self.transfer_out(&self.vault_y, &self.user_y, out_u64)?;
        } else {
            self.transfer_out(&self.vault_x, &self.user_x, out_u64)?;
        }

        Ok(())
    }

    /* --------------------- helper: user -> vault ------------------------ */
    fn transfer_in(
        &self,
        from: &Account<'info, TokenAccount>,
        to:   &Account<'info, TokenAccount>,
        amount: u64,
    ) -> Result<()> {
        let ctx = CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to:   to.to_account_info(),
                authority: self.user.to_account_info(),
            },
        );
        transfer(ctx, amount)
    }

    /* --------------------- helper: vault -> user ------------------------ */
   fn transfer_out(
    &self,
    from: &Account<'info, TokenAccount>,
    to:   &Account<'info, TokenAccount>,
    amount: u64,
) -> Result<()> {
    /* --------------------------------------------------------------
     * 1. Put every dynamic piece in its own stack variable
     *    so the borrow lives for the whole function body.
     * -------------------------------------------------------------- */
    let seed_bytes  = self.config.seed.to_le_bytes();       // [u8; 8]
    let bump_bytes  = [self.config.config_bump];            // [u8; 1]

    /* --------------------------------------------------------------
     * 2. Build the signer-seed array.
     *    Using a `let` binding keeps it alive until the end
     *    of this function, satisfying the borrow checker.
     * -------------------------------------------------------------- */
    let seeds: [&[u8]; 3] = [
        b"config",          // &[u8; 6]   → &[u8]
        &seed_bytes,        // &[u8; 8]   → &[u8]
        &bump_bytes,        // &[u8; 1]   → &[u8]
    ];

    // Anchor expects `&[&[&[u8]]]` (slice of seed groups).
    // Here we have only one group, so wrap `&seeds` in another slice:
    let signer_seeds: &[&[&[u8]]] = &[&seeds];

    /* -------------------------------------------------------------- */
    let cpi_ctx = CpiContext::new_with_signer(
        self.token_program.to_account_info(),
        Transfer {
            from:      from.to_account_info(),
            to:        to.to_account_info(),
            authority: self.config.to_account_info(), // PDA owner
        },
        signer_seeds,
    );

    transfer(cpi_ctx, amount)
}
}

/* -------------------------------------------------------------------------- */
/*                                Error codes                                 */
/* -------------------------------------------------------------------------- */
#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Slippage too high")]
    SlippageTooHigh,
}