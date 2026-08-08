//! Canon program errors.

use anchor_lang::prelude::*;

#[error_code]
pub enum CanonError {
    #[msg("rules_hash must not be the zero hash (Accord namespace-squat guard).")]
    InvalidRulesHash,
    #[msg("challenge_pct exceeds the maximum (MAX_CHALLENGE_PCT_BPS).")]
    ChallengePctTooHigh,
}
