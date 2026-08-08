//! Canon error codes. Covers every v1 instruction class; instruction beans
//! select the variants they need.

use anchor_lang::prelude::*;

#[error_code]
pub enum CanonError {
    #[msg("Curated account is not owned by the list's list_program.")]
    OwnerMismatch,
    #[msg("Tendered deposit does not match the list's submit_deposit.")]
    DepositMismatch,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
}
