use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount, Transfer, transfer, MintTo, mint_to}
};
use constant_product_curve::ConstantProduct;

use crate::state::Config;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user:Signer<'info>,
    pub mint_x: Account<'info, Mint>,
    pub mint_y: Account<'info, Mint>,

    #[account(mut,
        seeds = [b"lp", config.key().as_ref()],
        bump = config.lp_bump,
    )]
    pub mint_lp: Account<'info, Mint>,

    #[account(mut,
        associated_token::mint = mint_x,
        associated_token::authority = config,
    )]
    pub vault_x: Account<'info, TokenAccount>,

    #[account(mut,
        associated_token::mint = mint_y,
        associated_token::authority = config,
    )]
    pub vault_y: Account<'info, TokenAccount>,

    #[account(mut,
        associated_token::mint = mint_x,
        associated_token::authority = user,
    )]
    pub user_x: Account<'info, TokenAccount>,//Associated Token Accounts (ATA). Holds user’s Token X
    
    #[account(mut,
        associated_token::mint = mint_y,
        associated_token::authority = user,
    )]
    pub user_y: Account<'info, TokenAccount>,//Associated Token Accounts (ATA). Holds user’s Token Y


    
    #[account(
        has_one = mint_x,
        has_one = mint_y,
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_lp,
        associated_token::authority = user,
    )]
    pub user_lp: Account<'info, TokenAccount>,//Associated Token Accounts (ATA). Holds user’s LP

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
	//Example
    //deposit(amount = 1_000, max_x = 500_000, max_y = 250_000)
    //•	User wants 1,000 LP tokens
	//•	They’re willing to deposit up to 500,000 units of Token X and 250,000 units of Token Y
	//•	The contract will compute the actual required amounts x and y needed to mint 1,000 LP tokens using current pool ratios
    //. if the pool is empty (x, y) = (max_x, max_y)
	//•	If x <= max_x and y <= max_y, the deposit goes through
	//•	Otherwise, it errors out due to slippage
impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount: u64, max_x: u64, max_y: u64) -> Result<()> {

        assert!(amount != 0);
        //If the pool is empty:
        let (x,y) = match self.mint_lp.supply == 0 && self.vault_x.amount == 0 {
            true => (max_x, max_y),
            false => {
                let amounts = ConstantProduct::xy_deposit_amounts_from_l(
                    self.vault_x.amount, // current X in pool
                    self.vault_y.amount, // current Y in pool
                    self.mint_lp.supply, // total LP supply
                    amount,              // how many LP tokens user wants
                    6
                ).unwrap();

                (amounts.x, amounts.y)
            },
        };

        assert!(x <= max_x && y <= max_y);
        self.deposit_token(true, x)?;
        self.deposit_token(false, y)?;
        self.mint_lp_token(amount)?;

        Ok(())
    }

    pub fn deposit_token(&self, is_x: bool, amount: u64) -> Result<()> {
        let (from,to) = match is_x {
            true => (self.user_x.to_account_info(), self.vault_x.to_account_info()),
            false => (self.user_y.to_account_info(), self.vault_y.to_account_info()),
        };

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = Transfer{
            from,
            to,
            authority: self.user.to_account_info()
        };

        let ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(ctx, amount)?;
        Ok(())
    }

    pub fn mint_lp_token(&self, amount: u64) -> Result<()>{
        let cpi_program = self.token_program.to_account_info();

        let cpi_accoutns = MintTo{
            mint: self.mint_lp.to_account_info(),
            to: self.user_lp.to_account_info(),
            authority: self.config.to_account_info(),
        };

        let seeds = &[
            &b"config"[..],
            &self.config.seed.to_le_bytes(),
            &[self.config.config_bump],
        ];

        let signer_seeds = &[&seeds[..]];

        let ctx = CpiContext::new_with_signer(cpi_program, cpi_accoutns, signer_seeds);

        mint_to(ctx, amount)?;

        Ok(())
    }
}