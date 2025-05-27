//! Pure-math LMSR helpers (Rust, on-chain)
use anchor_lang::prelude::*;
use crate::errors::SomeError;

/// `exp(25_000) ≈ 10^(1.08 × 10⁴)` – practically the f64 limit.
/// Anything larger would overflow anyway, so we bail out early.
const MAX_EXP_INPUT: f64 = 25_000.0;

// ───────────────────────────────────────────────────────────────
//  log-sum-exp trick for numerical stability
// ───────────────────────────────────────────────────────────────
pub fn log_sum_exp(x: f64, y: f64) -> f64 {
    let m = x.max(y);
    let n = x.min(y);
    m + (n - m).exp().ln_1p()
}

// ----------------------------------------------------------------
//  LMSR cost   C(q⃗) = b · ln( exp(q_yes / b) + exp(q_no / b) )
// ----------------------------------------------------------------
pub fn lmsr_cost(b: f64, q_yes: f64, q_no: f64) -> Result<f64> {
    let r_yes = q_yes / b;
    let r_no  = q_no  / b;

    if r_yes > MAX_EXP_INPUT || r_no > MAX_EXP_INPUT {
        return Err(SomeError::MathError.into());
    }

    let val = b * log_sum_exp(r_yes, r_no);
    if !val.is_finite() {
        Err(SomeError::MathError.into())
    } else {
        Ok(val)                         // μUSDC
    }
}

//  Cost to buy Δ shares on one side
pub fn lmsr_buy_cost(
    b: f64,
    current_yes: u64,
    current_no:  u64,
    buy_yes: bool,
    delta: u64,
) -> Result<f64> {
    let before = lmsr_cost(b, current_yes as f64, current_no as f64)?;
    let after  = if buy_yes {
        lmsr_cost(b, current_yes as f64 + delta as f64, current_no as f64)?
    } else {
        lmsr_cost(b, current_yes as f64, current_no as f64 + delta as f64)?
    };
    Ok((after - before).max(0.0))       // μUSDC
}

// ───────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────
pub fn safe_f64_to_u64(v: f64) -> Result<u64> {
    if v < 0.0 || v > u64::MAX as f64 || !v.is_finite() {
        Err(SomeError::MathError.into())
    } else {
        Ok(v.round() as u64)
    }
}

pub fn checked_fee_amount(cost: u64, fee_bps: u64) -> Result<u64> {
    let mul = (cost as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(SomeError::MathError)?;
    Ok((mul / 10_000) as u64)
}