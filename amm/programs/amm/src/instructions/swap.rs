use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Transfer, transfer, Token, TokenAccount, Mint},
};
use constant_product_curve::ConstantProduct; // Or your own math library

use crate::state::Config;

// The data for your Swap instruction
#[derive(Accounts)]
pub struct Swap<'info> {
    // The user performing the swap
    #[account(mut)]
    pub user: Signer<'info>,

    // The AMM config that holds state (authority, fees, seeds, etc.)
    #[account(
        // This ensures we read the correct config by its seeds
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.config_bump,
        has_one = mint_x,
        has_one = mint_y,      // You can also add constraints like `constraint = !config.locked`
    )]
    pub config: Account<'info, Config>,

    // The token mints for X and Y
    pub mint_x: Account<'info, Mint>,
    pub mint_y: Account<'info, Mint>,

    // The vaults that hold X and Y for the pool
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

    // The user's associated token accounts for X and Y
    // Marked mut because we'll transfer tokens in/out
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

    // Programs needed for CPIs
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// This struct defines user parameters for a swap
// You'd pass these as function parameters in your lib.rs
pub struct SwapParams {
    pub amount_in: u64,   // How many tokens the user is sending in
    pub min_out: u64,     // The least they're willing to receive (slippage protection)
    pub is_x_to_y: bool,  // true if swapping X->Y, false if Y->X
}

impl<'info> Swap<'info> {
    pub fn process(&mut self, amount_in:u64,min_out:u64,is_x_to_y:bool) -> Result<()> {
        // 1) Transfer amount_in from user -> the appropriate vault
        if is_x_to_y {
            self.transfer_in(&self.user_x, &self.vault_x, amount_in)?;
        } else {
            self.transfer_in(&self.user_y, &self.vault_y, amount_in)?;
        }

        // 2) Compute out_amount using constant-product formula
        let (dx_balance, dy_balance) = (self.vault_x.amount, self.vault_y.amount);
        // A typical constant-product 'k' = X * Y
        let k = dx_balance.checked_mul(dy_balance)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))?;

        // Apply fees – for example, user pays a fee on the input
        let fee_bps = self.config.fees as u128; // or however you're storing fees
        // e.g. if self.config.fees = 30 = 0.3% in basis points
        let numerator = 10_000u128.checked_sub(fee_bps)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))?; 
        let dx_in_with_fee = 
            (amount_in as u128).checked_mul(numerator)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))? 
            / 10_000u128; // scale for BPS

        // Depending on direction:
        // X->Y means 'X' goes up by dx_in_with_fee, so we recompute how much Y must go down
        // Y->X is analogous but reversed
        let (mut in_balance, mut out_balance) = (dx_balance as u128, dy_balance as u128);
        if !is_x_to_y {
            // If we're actually Y->X, swap them for the math
            (in_balance, out_balance) = (dy_balance as u128, dx_balance as u128);
        }

        let in_new = in_balance.checked_add(dx_in_with_fee)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))?;
        // out_new = k / in_new
        let out_new = k.checked_div(in_new)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))?;

        let out_amount = out_balance.checked_sub(out_new)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))?;

        // 3) Slippage check – out_amount must be >= min_out or we fail
        require!(
            out_amount as u64 >= min_out,
            ErrorCode::SlippageTooHigh
        );

        // 4) Transfer out_amount from the other vault to the user
        let out_amount_u64 = out_amount as u64;  // safe if it fits in u64
        if is_x_to_y {
            // vault_y -> user_y
            self.transfer_out(&self.vault_y, &self.user_y, out_amount_u64)?;
        } else {
            // vault_x -> user_x
            self.transfer_out(&self.vault_x, &self.user_x, out_amount_u64)?;
        }

        // That's basically it. Optionally track how many fees the program earned if desired
        Ok(())
    }

    /// Transfer tokens from user to vault
    fn transfer_in(
        &self,
        from: &Account<'info, TokenAccount>,
        to: &Account<'info, TokenAccount>,
        amount: u64
    ) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to: to.to_account_info(),
                authority: self.user.to_account_info(),
            },
        );
        transfer(cpi_ctx, amount)?;
        Ok(())
    }

    /// Transfer tokens from vault to user
    fn transfer_out(
        &self,
        from: &Account<'info, TokenAccount>,
        to: &Account<'info, TokenAccount>,
        amount: u64
    ) -> Result<()> {
        // Because the vault is owned by `config` (a PDA),
        // we must sign with the config seeds. 
        // That means we need 'config' seeds to sign CPIs.

        let seeds = &[
            b"config",
            &self.config.seed.to_le_bytes(),
            &[self.config.config_bump],
        ];
        let signers = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to: to.to_account_info(),
                // authority is the config, a PDA
                authority: self.config.to_account_info(),
            },
            signers
        );

        transfer(cpi_ctx, amount)?;
        Ok(())
    }
}

// You might define some custom error codes for clarity
#[error_code]
pub enum ErrorCode {
    #[msg("An integer overflow occurred in math calculations.")]
    MathOverflow,
    #[msg("Slippage too high; received fewer tokens than expected.")]
    SlippageTooHigh,
}

