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
    #[msg("Item is not in the Disputed state.")]
    NotDisputed,
    #[msg("Accord dispute has not reached the Final state.")]
    DisputeNotFinal,
    #[msg("Dispute final_ruling is not a valid Canon option.")]
    InvalidRuling,
    #[msg("rules_hash must not be the zero hash (would collide with absent criteria).")]
    InvalidRulesHash,
    #[msg("challenge_pct exceeds MAX_CHALLENGE_PCT_BPS.")]
    ChallengePctTooHigh,
    #[msg("evidence_operator must not be Pubkey::default — a zero operator key can never receive encrypted evidence.")]
    InvalidEvidenceOperator,
    #[msg("Item is not in the Removed state.")]
    NotRemoved,
    #[msg("Removed item still holds accumulated_stake (invariant breach).")]
    StakeOutstanding,
    #[msg("court.alpha_bps exceeds 10_000 (100%).")]
    AlphaTooHigh,
    #[msg("court review/commit/reveal windows must be nonzero — a zero window bricks disputes forever and strands third-party item deposits.")]
    WindowTooShort,
    #[msg("court.depth exceeds MAX_LIST_TREE_DEPTH — the MST path in every stake/draw tx would blow the packet budget.")]
    TreeDepthTooDeep,
}
