use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, Burn};
use crate::state::{MarketState, OutcomeSide};
use crate::errors::SomeError;

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        mut,
        seeds = [b"market", market.authority.as_ref(), &market.seed.to_le_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, MarketState>,

    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// CHECK: official USDC mint (needed only for ATA constraint)
    pub usdc_mint: Account<'info, Mint>,
        
    #[account(mut)]
    pub user_outcome_account: Account<'info, TokenAccount>,
     
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,
     
    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,
    #[account(mut)]
    pub no_mint: Account<'info, Mint>,
     
    pub token_program: Program<'info, Token>,
     
    #[account(signer)]
    pub user: Signer<'info>,
}

impl<'info> ClaimRewards<'info> {
    pub fn claim_rewards(&mut self) -> Result<()> {
        require!(self.market.resolved, SomeError::MarketNotResolved);

        // Determine the winning side
        let winning_side = self.market.winner.ok_or(SomeError::NoWinnerYet)?;
        let user_mint = self.user_outcome_account.mint;
        
        if winning_side == OutcomeSide::Yes && user_mint != self.market.yes_mint {
            return Err(SomeError::WrongSide.into());
        }
        if winning_side == OutcomeSide::No && user_mint != self.market.no_mint {
            return Err(SomeError::WrongSide.into());
        }

        // Get user's winning token balance
        let user_tokens = self.user_outcome_account.amount;
        require!(user_tokens > 0, SomeError::NoTokensToRedeem);

        // Calculate proportional vault distribution
        let total_winning_shares = match winning_side {
            OutcomeSide::Yes => self.market.yes_shares,
            OutcomeSide::No => self.market.no_shares,
        };
        
        require!(total_winning_shares > 0, SomeError::NoRewardsAvailable);
        
        let vault_balance = self.vault.amount;
        require!(vault_balance > 0, SomeError::InsufficientVaultFunds);
        
        // Calculate user's proportional share of the vault
        // user_payout = (user_tokens / total_winning_shares) * vault_balance
        let user_payout = (user_tokens as u128)
            .checked_mul(vault_balance as u128)
            .ok_or(SomeError::MathError)?
            .checked_div(total_winning_shares as u128)
            .ok_or(SomeError::MathError)? as u64;

        require!(user_payout > 0, SomeError::NoRewardsAvailable);
        require!(vault_balance >= user_payout, SomeError::InsufficientVaultFunds);

        // Use "market" (PDA) to sign the vault transfer
        let seeds = &[
            b"market",
            self.market.authority.as_ref(),
            &self.market.seed.to_le_bytes(),
            &[self.market.bump],
        ];
        
        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.vault.to_account_info(),
                    to: self.user_usdc_account.to_account_info(),
                    authority: self.market.to_account_info(),
                },
                &[&seeds[..]],
            ),
            user_payout,
        )?;

        // Burn the user's winning outcome tokens
        let mint_account = if winning_side == OutcomeSide::Yes {
            &self.yes_mint
        } else {
            &self.no_mint
        };
        
        token::burn(
            CpiContext::new(
                self.token_program.to_account_info(),
                Burn {
                    mint: mint_account.to_account_info(),
                    from: self.user_outcome_account.to_account_info(),
                    authority: self.user.to_account_info(),
                },
            ),
            user_tokens,
        )?;

        Ok(())
    }
}