/**
 * Typed mapping of AccordError codes.
 *
 * Anchor assigns sequential codes starting at 6000 (the `ERROR_CODE_OFFSET`).
 * The order matches the `#[error_code]` enum declaration in
 * `programs/accord/src/errors.rs`.
 */

export const ACCORD_ERROR_CODE_OFFSET = 6000;

export type AccordErrorCode = {
  readonly code: number;
  readonly name: string;
  readonly message: string;
};

function err(code: number, name: string, message: string): AccordErrorCode {
  return { code, name, message } as const;
}

const BASE = ACCORD_ERROR_CODE_OFFSET;

export const AccordErrors = {
  // --- authority / timelock (ADR-0005) ---
  Unauthorized: err(
    BASE + 0,
    "Unauthorized",
    "Signer is not the Subaccord authority.",
  ),
  ImmutableSubaccord: err(
    BASE + 1,
    "ImmutableSubaccord",
    "Subaccord is immutable (authority == default).",
  ),
  TimelockNotElapsed: err(
    BASE + 2,
    "TimelockNotElapsed",
    "Timelock has not elapsed yet.",
  ),
  NoPendingUpdate: err(
    BASE + 3,
    "NoPendingUpdate",
    "No pending update to execute.",
  ),

  // --- circuit breaker (ADR-0007) ---
  NotPauseAuthority: err(
    BASE + 4,
    "NotPauseAuthority",
    "Signer is not the pause authority.",
  ),
  AlreadyPaused: err(BASE + 5, "AlreadyPaused", "Program is already paused."),
  NotPaused: err(BASE + 6, "NotPaused", "Program is not paused."),
  NoPendingUnpause: err(
    BASE + 7,
    "NoPendingUnpause",
    "No pending unpause to execute.",
  ),
  UnpauseTimelockNotElapsed: err(
    BASE + 8,
    "UnpauseTimelockNotElapsed",
    "Unpause timelock has not elapsed yet.",
  ),
  ProgramPaused: err(
    BASE + 9,
    "ProgramPaused",
    "Program is paused; this instruction is halted.",
  ),

  // --- staking ---
  InsufficientStake: err(
    BASE + 10,
    "InsufficientStake",
    "Staked amount is below the Subaccord minimum.",
  ),
  StakeLocked: err(
    BASE + 11,
    "StakeLocked",
    "Cannot unstake while active_draws > 0 (stake is frozen until drawn disputes settle).",
  ),
  InvalidAmount: err(
    BASE + 12,
    "InvalidAmount",
    "Amount must be greater than zero.",
  ),
  InsufficientBalance: err(
    BASE + 13,
    "InsufficientBalance",
    "Withdrawal exceeds the Juror's staked balance.",
  ),

  // --- dispute intake ---
  InsufficientJurors: err(
    BASE + 14,
    "InsufficientJurors",
    "Subaccord has fewer active distinct stakers than the required panel size.",
  ),
  InvalidOptions: err(
    BASE + 15,
    "InvalidOptions",
    "Dispute options are invalid (need 2..=MAX_OPTIONS).",
  ),
  InvalidState: err(
    BASE + 16,
    "InvalidState",
    "Dispute is not in the required state for this instruction.",
  ),
  FeeMismatch: err(
    BASE + 17,
    "FeeMismatch",
    "Tendered fee does not match the required dispute fee (initial_num_jurors * fee_per_juror).",
  ),

  // --- accumulator (ADR-0012) ---
  InvalidMerklePath: err(
    BASE + 18,
    "InvalidMerklePath",
    "Accumulator Merkle path does not authenticate against the stored root.",
  ),
  TreeFull: err(
    BASE + 19,
    "TreeFull",
    "Accumulator tree is full (no free leaf within the configured depth).",
  ),

  // --- draw ---
  DuplicateJuror: err(
    BASE + 20,
    "DuplicateJuror",
    "Draw selected a duplicate Juror.",
  ),
  InvalidMembershipProof: err(
    BASE + 21,
    "InvalidMembershipProof",
    "Juror Merkle membership/weight proof is invalid.",
  ),
  InvalidPanelSize: err(
    BASE + 22,
    "InvalidPanelSize",
    "Number of juror memberships does not match the required panel size.",
  ),
  InflatedStake: err(
    BASE + 23,
    "InflatedStake",
    "Drawn juror's live stake is below the accumulator leaf's claim (inflation guard, ADR-0012).",
  ),
  SortitionMismatch: err(
    BASE + 24,
    "SortitionMismatch",
    "Submitted membership does not match the VRF-derived sortition selection (ADR-0009).",
  ),
  VrfAlreadyCommitted: err(
    BASE + 25,
    "VrfAlreadyCommitted",
    "VRF result already committed for this dispute.",
  ),
  VrfNotCommitted: err(
    BASE + 26,
    "VrfNotCommitted",
    "No VRF result committed for this dispute; the root is not yet frozen.",
  ),

  // --- voting ---
  CommitAlreadyExists: err(
    BASE + 27,
    "CommitAlreadyExists",
    "Juror has already committed.",
  ),
  CommitMissing: err(
    BASE + 28,
    "CommitMissing",
    "No commit to reveal for this Juror.",
  ),
  RevealMismatch: err(
    BASE + 29,
    "RevealMismatch",
    "Reveal does not match the committed hash.",
  ),
  CommitWindowClosed: err(
    BASE + 30,
    "CommitWindowClosed",
    "Commit window is closed.",
  ),
  RevealWindowClosed: err(
    BASE + 31,
    "RevealWindowClosed",
    "Reveal window is closed.",
  ),
  NotDrawnJuror: err(
    BASE + 32,
    "NotDrawnJuror",
    "Signer is not a drawn Juror for this round.",
  ),
  InvalidVote: err(
    BASE + 33,
    "InvalidVote",
    "Revealed vote index is out of range.",
  ),
  AlreadyRevealed: err(
    BASE + 34,
    "AlreadyRevealed",
    "Juror has already revealed.",
  ),

  // --- finalization ---
  AppealWindowOpen: err(
    BASE + 35,
    "AppealWindowOpen",
    "Appeal window has not elapsed yet.",
  ),

  // --- appeals (ADR-0004) ---
  MaxAppealsReached: err(
    BASE + 36,
    "MaxAppealsReached",
    "Maximum appeals reached for this dispute.",
  ),
  MaxAppealsLimitExceeded: err(
    BASE + 37,
    "MaxAppealsLimitExceeded",
    "Subaccord max_appeals exceeds the program ceiling.",
  ),
  AppealWindowClosed: err(
    BASE + 38,
    "AppealWindowClosed",
    "Appeal window has closed; the dispute can only be finalized.",
  ),

  // --- finalization ---
  RoundNotFinalizable: err(
    BASE + 39,
    "RoundNotFinalizable",
    "Round cannot be finalized yet (window not elapsed).",
  ),
  DisputeNotFinal: err(
    BASE + 40,
    "DisputeNotFinal",
    "Dispute is not in a finalizable state.",
  ),

  // --- arithmetic ---
  ArithmeticOverflow: err(
    BASE + 41,
    "ArithmeticOverflow",
    "Arithmetic overflow.",
  ),

  // --- multi-round settlement (CONCEPT-REVIEW Ugly 5 / accord-r6ti) ---
  RoundAlreadySettled: err(
    BASE + 42,
    "RoundAlreadySettled",
    "Round has already been settled.",
  ),
  RoundNotSettlable: err(
    BASE + 43,
    "RoundNotSettlable",
    "Round index out of range for settlement (must be < current_round).",
  ),

  // --- cancel / Failed state (Ugly 4) ---
  DisputeFailed: err(
    BASE + 44,
    "DisputeFailed",
    "Dispute is in terminal Failed state.",
  ),
  CancelTooEarly: err(
    BASE + 45,
    "CancelTooEarly",
    "Dispute has not exceeded its stage timeout; cancel_dispute is not yet available.",
  ),

  // --- draw (bean accord-tzo0) ---
  MaxRetriesExceeded: err(
    BASE + 46,
    "MaxRetriesExceeded",
    "Sortition retries exceeded the on-chain bound; the pool may be too concentrated.",
  ),
} as const;

export type AccordErrorName = keyof typeof AccordErrors;
