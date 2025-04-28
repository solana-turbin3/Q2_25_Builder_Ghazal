use anchor_lang::prelude::*;

#[error_code]
pub enum SomeError {
    #[msg("The market is already resolved.")]
    MarketAlreadyResolved,

    #[msg("The market is not resolved yet.")]
    MarketNotResolved,

    #[msg("No winner has been set for this market.")]
    NoWinnerYet,

    #[msg("User tried to claim with the wrong outcome side.")]
    WrongSide,
}
