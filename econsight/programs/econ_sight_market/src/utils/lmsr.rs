// programs/econ_sight_market/src/utils/lmsr.rs

use anchor_lang::prelude::*;
use crate::errors::SomeError; // or wherever you define your custom errors

// Existing LMSR cost functions
pub fn lmsr_cost(b_val_f: f64, yes_shares: f64, no_shares: f64) -> f64 {
    let exp_yes = (yes_shares / b_val_f).exp();
    let exp_no  = (no_shares / b_val_f).exp();
    b_val_f * (exp_yes + exp_no).ln()
}

pub fn lmsr_buy_cost(
    b_val_f: f64,
    current_yes: u64,
    current_no: u64,
    buy_side: bool,
    delta_shares: u64,
) -> f64 {
    let before_yes = current_yes as f64;
    let before_no  = current_no as f64;

    let cost_before = lmsr_cost(b_val_f, before_yes, before_no);

    let (after_yes, after_no) = if buy_side {
        (before_yes + delta_shares as f64, before_no)
    } else {
        (before_yes, before_no + delta_shares as f64)
    };
    let cost_after = lmsr_cost(b_val_f, after_yes, after_no);

    let diff = cost_after - cost_before;
    diff.max(0.0)
}

// ADD these two functions so purchase_outcome.rs can import them:
pub fn safe_f64_to_u64(val_f: f64) -> std::result::Result<u64, SomeError> {
    if val_f < 0.0 {
        return Err(SomeError::MathError);
    }
    if val_f > (u64::MAX as f64) {
        return Err(SomeError::MathError);
    }
    Ok(val_f.round() as u64)
}

pub fn checked_fee_amount(cost: u64, fee_bps: u64) -> std::result::Result<u64, SomeError> {
    let mul_128 = (cost as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(SomeError::MathError)?;
    let div_128 = mul_128 / 10_000u128;
    if div_128 > (u64::MAX as u128) {
        return Err(SomeError::MathError);
    }
    Ok(div_128 as u64)
}
