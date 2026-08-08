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
    #[msg("Item is not in the Pending state.")]
    NotPending,
    #[msg("Listing window has not elapsed yet.")]
    ListingWindowOpen,
    #[msg("Item is already Disputed.")]
    AlreadyDisputed,
    #[msg("Item is not challengeable (must be Pending, Listed, or WithdrawPending).")]
    InvalidItemState,
    #[msg("Challenger has insufficient funds for challenge_stake + accord_fee.")]
    InsufficientFunds,
    #[msg("Provided Subaccord does not match the list's backing Subaccord.")]
    SubaccordMismatch,
    #[msg("Dispute PDA does not match the expected derivation.")]
    DisputePdaMismatch,
    #[msg("Missing remaining_accounts for the Accord CPI.")]
    MissingRemainingAccounts,
    #[msg("Wrong Accord program account.")]
    WrongAccordProgram,
    #[msg("Item is not in the Listed state.")]
    NotListed,
    #[msg("Item is not in the WithdrawPending state.")]
    NotWithdrawPending,
    #[msg("Withdrawal timelock has not elapsed yet.")]
    WithdrawalTimelockOpen,
    #[msg("Caller is not the item submitter.")]
    NotSubmitter,
}
