use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub mint: Pubkey, // frog nft mint
    pub staked_at: i64, // timestamp of when the nft was staked
    pub bump: u8,
}