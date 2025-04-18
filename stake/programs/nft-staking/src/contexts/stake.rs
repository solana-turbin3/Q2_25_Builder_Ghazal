use anchor_lang::prelude::*;
use anchor_spl::{
    metadata::{
        mpl_token_metadata::instructions::{
            FreezeDelegatedAccountCpi, FreezeDelegatedAccountCpiAccounts,
        },
        MasterEditionAccount, Metadata, MetadataAccount,
        },
        token::{approve, Approve, Mint, Token, TokenAccount},
};

use crate::{stake_account, state::{StakeAccount, StakeConfig,  UserAccount}};
use crate::error::StakeError;

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub mint: Account<'info, Mint>,

    #[account(
        mut, 
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub mint_ata: Account<'info, TokenAccount>,
    pub collection_mint: Account<'info, Mint>,
    #[account(
        seeds = [
            b"metadata",
            metadata_program.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
        seeds::program = metadata_program.key(),
        constraint = metadata.collection.as_ref().unwrap().key.as_ref() == collection_mint.key().as_ref(),
        constraint = metadata.collection.as_ref().unwrap().verified == true,
    )]
    pub metadata: Account<'info, MetadataAccount>,

    #[account(
        seeds = [
            b"metadata",
            metadata_program.key().as_ref(),
            mint.key().as_ref(),
            b"edition"
        ],
        seeds::program = metadata_program.key(),
        bump,
    )]
    pub edition: Account<'info, MasterEditionAccount>,

    #[account(
    seeds = [b"config".as_ref()],
    bump = user_account.bump,   
    )]
    pub config: Account<'info, StakeConfig>,

    #[account(
        mut,
        seeds = [
            b"user".as_ref(),
            user.key().as_ref(),
        ],
        bump = user_account.bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        init, 
        payer = user,
        space = StakeAccount::INIT_SPACE+8,
        seeds = [
            b"stake_account",
            mint.key().as_ref(),
            config.key().as_ref(),
        ],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,
    pub metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

impl<'info> Stake<'info> {
    pub fn stake(&mut self, bumps: &StakeBumps) -> Result<()> {
    
    assert!(self.user_account.amount_staked<=self.config.max_stake);
    
        //Alice (the wallet) is delegating one‑time control over her NFT token account to the stake_account PDA so the staking program 
        //can freeze and later thaw the NFT without ever holding Alice’s private key.
        let cpi_program = self.token_program.to_account_info();

        let cpi_account = Approve {
            to: self.mint_ata.to_account_info(),
            delegate: self.stake_account.to_account_info(),
            authority: self.user.to_account_info(),
        };

        let cpi_cpx = CpiContext::new(cpi_program, cpi_account);

        approve(cpi_cpx, 1)?;

        //
        let delegate = &self.stake_account.to_account_info();
        let token_account = &self.mint_ata.to_account_info();
        let edition = &self.edition.to_account_info();
        let mint = &self.mint.to_account_info();
        let token_program = &self.token_program.to_account_info();
        let metadata = &self.metadata.to_account_info();
        //

        let seeds = &[
        b"stake_account",
        self.config.to_account_info().key.as_ref(),
        self.mint.to_account_info().key.as_ref(),
        &[self.stake_account.bump]
        ];
        
        let signer_seeds = &[&seeds[..]];

    FreezeDelegatedAccountCpi::new(
    metadata,
    FreezeDelegatedAccountCpiAccounts{
        delegate,
        token_account,
        edition,
        mint,
        token_program
        }
    ).invoke_signed(signer_seeds);

     self.stake_account.set_inner(StakeAccount{
        owner:self.user.key(),
        mint:self.user.key(),
        staked_at:Clock::get()?.unix_timestamp,
        bump:bumps.stake_account
     }); 

        Ok(())
    }
}