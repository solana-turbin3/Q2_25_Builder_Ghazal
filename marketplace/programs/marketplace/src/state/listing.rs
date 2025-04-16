use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ListingAccount {
    pub maker: Pubkey,
    pub mint: Pubkey,
    pub price: u64, // price in sol
    pub bump: u8,
}

