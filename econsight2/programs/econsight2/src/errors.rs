use anchor_lang::prelude::*;

#[error_code]
pub enum SomeError {
    #[msg("The market is not yet resolved.")]
    MarketNotResolved,

    #[msg("The market is already resolved.")]
    MarketAlreadyResolved,

    #[msg("No winner set yet.")]
    NoWinnerYet,

    #[msg("You tried to claim the wrong side.")]
    WrongSide,

    #[msg("Attempted to create or interact with an expired market.")]
    MarketExpired,

    #[msg("Attempted to resolve the market before expiry.")]
    MarketNotExpiredYet,

    #[msg("You have insufficient funds to complete this transaction.")]
    InsufficientFunds,

    #[msg("Math error (overflow/underflow).")]
    MathError,

    #[msg("No winning shares in this account")]
    NoWinningShares, 
     #[msg("No tokens to redeem")]
    NoTokensToRedeem,
    #[msg("No rewards available")]
    NoRewardsAvailable,
    #[msg("Insufficient vault funds")]
    InsufficientVaultFunds,
    
}
