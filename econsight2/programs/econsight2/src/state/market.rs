use anchor_lang::prelude::*;
#[derive(InitSpace)] 
#[account]

pub struct MarketState {
    /* PDA meta -------------------------------------------------- */
    pub seed:      u64,
    pub bump:      u8,
    pub authority: Pubkey,

    /* Core market data ----------------------------------------- */
    #[max_len(256)]
    pub question:          String,
    pub expiry_timestamp:  i64,
    pub yes_mint:          Pubkey,
    pub no_mint:           Pubkey,

    pub resolved: bool,
    pub winner:   Option<OutcomeSide>,

    /* Fees ------------------------------------------------------ */
    pub fee_bps:  u16,
    pub treasury: Pubkey,

    /* LMSR bookkeeping ----------------------------------------- */
    pub yes_shares:    u64,
    pub no_shares:     u64,
    pub b_value_scaled: u64,
}
impl MarketState {
    pub const INIT_SPACE: usize = 8 + // discriminator
        8 + // seed (u64)
        1 + // bump (u8)
        32 + // authority (Pubkey)
        4 + 256 + // question (String with max_len 256)
        8 + // expiry_timestamp (i64)
        32 + // yes_mint (Pubkey)
        32 + // no_mint (Pubkey)
        1 + // resolved (bool)
        1 + 1 + // winner (Option<OutcomeSide>)
        2 + // fee_bps (u16)
        32 + // treasury (Pubkey)
        8 + // yes_shares (u64)
        8 + // no_shares (u64)
        8;  // b_value_scaled (u64)
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Debug,
    InitSpace         // keeps INIT_SPACE available if you need it later
)]
pub enum OutcomeSide {
    Yes,
    No,
}