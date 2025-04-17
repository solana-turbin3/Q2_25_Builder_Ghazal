use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    pub points: u32,      // the number of reward tokens
    pub amount_staked: u8, // the number of nfts staked
    pub bump: u8,
}