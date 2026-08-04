//! Accord error codes. Covers every v1 instruction class; instruction beans
//! select the variants they need.

use anchor_lang::prelude::*;

#[error_code]
pub enum AccordError {
    // --- authority / timelock (ADR-0005) ---
    #[msg("Signer is not the Subaccord authority.")]
    Unauthorized,
    #[msg("Subaccord is immutable (authority == default).")]
    ImmutableSubaccord,
    #[msg("Timelock has not elapsed yet.")]
    TimelockNotElapsed,
    #[msg("No pending update to execute.")]
    NoPendingUpdate,

    // --- circuit breaker (ADR-0007) ---
    #[msg("Signer is not the pause authority.")]
    NotPauseAuthority,
    #[msg("Program is already paused.")]
    AlreadyPaused,
    #[msg("Program is not paused.")]
    NotPaused,
    #[msg("No pending unpause to execute.")]
    NoPendingUnpause,
    #[msg("Unpause timelock has not elapsed yet.")]
    UnpauseTimelockNotElapsed,
    #[msg("Program is paused; this instruction is halted.")]
    ProgramPaused,

    // --- staking ---
    #[msg("Staked amount is below the Subaccord minimum.")]
    InsufficientStake,
    #[msg("Cannot unstake while active_draws > 0 (stake is frozen until drawn disputes settle).")]
    StakeLocked,
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Withdrawal exceeds the Juror's staked balance.")]
    InsufficientBalance,

    // --- dispute intake ---
    #[msg("Subaccord has fewer active distinct stakers than the required panel size.")]
    InsufficientJurors,
    #[msg("Dispute options are invalid (need 2..=MAX_OPTIONS).")]
    InvalidOptions,
    #[msg("Dispute is not in the required state for this instruction.")]
    InvalidState,
    #[msg("Tendered fee does not match the required dispute fee (jurors_per_dispute * fee_per_juror).")]
    FeeMismatch,

    // --- snapshot (ADR-0003) ---
    #[msg("Snapshot is not finalized (challenge window still open or voided).")]
    SnapshotNotFinalized,
    #[msg("Snapshot was voided by a successful fraud proof.")]
    SnapshotVoided,
    #[msg("Snapshot challenge window has not yet elapsed.")]
    SnapshotChallengeWindowOpen,
    #[msg("Snapshot challenge window has expired.")]
    SnapshotChallengeWindowExpired,
    #[msg("Fraud proof does not invalidate the posted Merkle root.")]
    FraudProofInvalid,

    // --- draw ---
    #[msg("Draw selected a duplicate Juror.")]
    DuplicateJuror,
    #[msg("Juror Merkle membership/weight proof is invalid.")]
    InvalidMembershipProof,
    #[msg("Number of juror memberships does not match the required panel size.")]
    InvalidPanelSize,

    // --- voting ---
    #[msg("Juror has already committed.")]
    CommitAlreadyExists,
    #[msg("No commit to reveal for this Juror.")]
    CommitMissing,
    #[msg("Reveal does not match the committed hash.")]
    RevealMismatch,
    #[msg("Commit window is closed.")]
    CommitWindowClosed,
    #[msg("Reveal window is closed.")]
    RevealWindowClosed,

    // --- appeals (ADR-0004) ---
    #[msg("Maximum appeals reached for this dispute.")]
    MaxAppealsReached,

    // --- finalization ---
    #[msg("Round cannot be finalized yet (window not elapsed).")]
    RoundNotFinalizable,
    #[msg("Dispute is not in a finalizable state.")]
    DisputeNotFinal,

    // --- arithmetic ---
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
}
