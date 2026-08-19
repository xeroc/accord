//! Accord error codes. Covers every v1 instruction class; instruction beans
//! select the variants they need.

use anchor_lang::prelude::*;

#[error_code]
pub enum AccordError {
    // --- authority / timelock (ADR-0005) ---
    #[msg("Signer is not the Subaccord authority.")]
    Unauthorized,
    #[msg("Dispute does not belong to this Subaccord (cross-pool substitution rejected).")]
    SubaccordMismatch,
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
    #[msg("Withdrawal timelock has not elapsed yet.")]
    WithdrawalTooEarly,
    #[msg("No pending withdrawal to execute.")]
    NoPendingWithdrawal,
    #[msg("Withdrawal exceeds the Juror's free stake (amount - slash_reserve).")]
    InsufficientBalance,
    #[msg("Settle pending reward/slash first: call reconcile_stake before request_withdraw.")]
    PendingSettlement,
    #[msg("A withdrawal is already pending — complete it via withdraw before requesting another.")]
    WithdrawalPending,

    // --- dispute intake ---
    #[msg("Subaccord has fewer active distinct stakers than the required panel size.")]
    InsufficientJurors,
    #[msg("Dispute options are invalid (need 2..=MAX_OPTIONS).")]
    InvalidOptions,
    #[msg("Dispute is not in the required state for this instruction.")]
    InvalidState,
    #[msg("Tendered fee does not match the required round-1 dispute fee (min_jury_size * fee_per_juror).")]
    FeeMismatch,

    // --- accumulator (ADR-0012) ---
    #[msg("Accumulator Merkle path does not authenticate against the stored root.")]
    InvalidMerklePath,
    #[msg("Accumulator tree is full (no free leaf within the configured depth).")]
    TreeFull,

    // --- draw ---
    #[msg("Draw selected a duplicate Juror.")]
    DuplicateJuror,
    #[msg("Juror Merkle membership/weight proof is invalid.")]
    InvalidMembershipProof,
    #[msg("Number of juror memberships does not match the required panel size.")]
    InvalidPanelSize,
    #[msg(
        "Drawn juror's live stake is below the accumulator leaf's claim (inflation guard, ADR-0012)."
    )]
    InflatedStake,
    #[msg("Submitted membership does not match the VRF-derived sortition selection (ADR-0009).")]
    SortitionMismatch,
    #[msg("VRF result already committed for this dispute.")]
    VrfAlreadyCommitted,
    #[msg("No VRF result committed for this dispute; the root is not yet frozen.")]
    VrfNotCommitted,

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
    #[msg("Signer is not a drawn Juror for this round.")]
    NotDrawnJuror,
    #[msg("Revealed vote index is out of range.")]
    InvalidVote,
    #[msg("Juror has already revealed.")]
    AlreadyRevealed,

    // --- finalization ---
    #[msg("Appeal window has not elapsed yet.")]
    AppealWindowOpen,

    // --- appeals (ADR-0004) ---
    #[msg("Maximum appeals reached for this dispute.")]
    MaxAppealsReached,
    #[msg("Subaccord max_appeals exceeds the program ceiling.")]
    MaxAppealsLimitExceeded,
    #[msg("Appeal window has closed; the dispute can only be finalized.")]
    AppealWindowClosed,
    #[msg("Appeal window is below the per-Subaccord floor (MIN_APPEAL_WINDOW_SECS).")]
    AppealWindowTooShort,

    // --- finalization ---
    #[msg("Round cannot be finalized yet (window not elapsed).")]
    RoundNotFinalizable,
    #[msg("Dispute is not in a finalizable state.")]
    DisputeNotFinal,

    // --- arithmetic ---
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,

    // --- multi-round settlement (CONCEPT-REVIEW Ugly 5 / accord-r6ti) ---
    #[msg("Round has already been settled.")]
    RoundAlreadySettled,
    #[msg("Round index out of range for settlement (must be < current_round).")]
    RoundNotSettlable,

    // --- cancel / Failed state (Ugly 4) ---
    #[msg("Dispute is in terminal Failed state.")]
    DisputeFailed,
    #[msg("Dispute has not exceeded its stage timeout; cancel_dispute is not yet available.")]
    CancelTooEarly,

    // --- draw (bean accord-tzo0) ---
    #[msg("Sortition retries exceeded the on-chain bound; the pool may be too concentrated.")]
    MaxRetriesExceeded,

    // --- two-mint economics (ADR-0020) ---
    #[msg("Juror has no earned fees to withdraw.")]
    NoFeesEarned,

    // --- reveal quorum + shortfall redraw (ADR-0021) ---
    #[msg("Dispute is not in RedrawEligible state; redraw is not available.")]
    NotRedrawEligible,
    #[msg("Subaccord max_draw_attempts exceeds the program ceiling.")]
    MaxDrawAttemptsLimitExceeded,
    #[msg("Basis-point value out of range (must be <= 10_000; reveal threshold or alpha).")]
    InvalidThreshold,
    // --- attestation-gated Subaccords (PROG-ATTESTTION) ---
    #[msg("Subaccord is credential-gated but no attestation account was provided.")]
    AttestationMissing,
    #[msg("Credential and schema must be set together (both-or-neither).")]
    AttestationBindingPartial,
    #[msg("Attestation account is malformed (wrong owner, discriminator, or too short).")]
    AttestationMalformed,
    #[msg("Attestation credential or schema does not match the Subaccord binding.")]
    AttestationMismatch,
    #[msg("Attestation subject wallet does not match the juror.")]
    AttestationSubjectMismatch,
    #[msg("Attestation has expired or will expire before the dispute lifecycle completes.")]
    AttestationExpired,
    #[msg("Attestation has not expired; prune_juror requires an actually-expired credential.")]
    AttestationNotExpired,

    // --- slot reclamation (RECLAIM-LEAF) ---
    #[msg(
        "JurorStake is not fully drained (staked, active_draws, stake_delta, or fees_earned > 0)."
    )]
    SlotNotDrained,
    #[msg("JurorStake slot is already on the free list (next_free != MAX).")]
    SlotAlreadyReclaimed,
    #[msg("Provided freed-slot account does not match the free-list head.")]
    FreeListHeadMismatch,
    #[msg(
        "Juror's tree slot was reclaimed and sits mid-free-list; retry once the slots ahead of it are recycled."
    )]
    SlotAwaitingRecycle,

    // --- per-Subaccord round-1 panel size (accord-9q3e) ---
    #[msg("Round-1 jury size (min_jury_size) must be odd (tie avoidance).")]
    EvenJurySize,
    #[msg("The appeal ladder (min_jury_size, max_appeals) exceeds MAX_JURORS at its top round.")]
    LadderExceedsMaxJurors,
}
