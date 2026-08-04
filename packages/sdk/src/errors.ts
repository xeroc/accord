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
    "Tendered fee does not match the required dispute fee (jurors_per_dispute * fee_per_juror).",
  ),

  // --- snapshot (ADR-0003) ---
  SnapshotNotFinalized: err(
    BASE + 18,
    "SnapshotNotFinalized",
    "Snapshot is not finalized (challenge window still open or voided).",
  ),
  SnapshotVoided: err(
    BASE + 19,
    "SnapshotVoided",
    "Snapshot was voided by a successful fraud proof.",
  ),
  SnapshotChallengeWindowOpen: err(
    BASE + 20,
    "SnapshotChallengeWindowOpen",
    "Snapshot challenge window has not yet elapsed.",
  ),
  SnapshotChallengeWindowExpired: err(
    BASE + 21,
    "SnapshotChallengeWindowExpired",
    "Snapshot challenge window has expired.",
  ),
  FraudProofInvalid: err(
    BASE + 22,
    "FraudProofInvalid",
    "Fraud proof does not invalidate the posted Merkle root.",
  ),

  // --- draw ---
  DuplicateJuror: err(
    BASE + 23,
    "DuplicateJuror",
    "Draw selected a duplicate Juror.",
  ),
  InvalidMembershipProof: err(
    BASE + 24,
    "InvalidMembershipProof",
    "Juror Merkle membership/weight proof is invalid.",
  ),
  InvalidPanelSize: err(
    BASE + 25,
    "InvalidPanelSize",
    "Number of juror memberships does not match the required panel size.",
  ),
  InflatedStake: err(
    BASE + 26,
    "InflatedStake",
    "Drawn juror's live stake is below the snapshot leaf's claim (inflation guard, ADR-0008).",
  ),
  SortitionMismatch: err(
    BASE + 27,
    "SortitionMismatch",
    "Submitted membership does not match the VRF-derived sortition selection (ADR-0009).",
  ),
  TreeNotSorted: err(
    BASE + 28,
    "TreeNotSorted",
    "Snapshot tree is not sorted by juror pubkey (ADR-0009 predicate 5).",
  ),
  OmissionProofInvalid: err(
    BASE + 29,
    "OmissionProofInvalid",
    "Omission proof is invalid (non-adjacent leaves, wrong order, or witness stake changed since anchor).",
  ),
  VrfAlreadyCommitted: err(
    BASE + 30,
    "VrfAlreadyCommitted",
    "VRF result already committed for this dispute.",
  ),
  VrfNotCommitted: err(
    BASE + 31,
    "VrfNotCommitted",
    "No VRF result committed for this dispute; call commit_vrf first.",
  ),

  // --- voting ---
  CommitAlreadyExists: err(
    BASE + 32,
    "CommitAlreadyExists",
    "Juror has already committed.",
  ),
  CommitMissing: err(
    BASE + 33,
    "CommitMissing",
    "No commit to reveal for this Juror.",
  ),
  RevealMismatch: err(
    BASE + 34,
    "RevealMismatch",
    "Reveal does not match the committed hash.",
  ),
  CommitWindowClosed: err(
    BASE + 35,
    "CommitWindowClosed",
    "Commit window is closed.",
  ),
  RevealWindowClosed: err(
    BASE + 36,
    "RevealWindowClosed",
    "Reveal window is closed.",
  ),
  NotDrawnJuror: err(
    BASE + 37,
    "NotDrawnJuror",
    "Signer is not a drawn Juror for this round.",
  ),
  InvalidVote: err(
    BASE + 38,
    "InvalidVote",
    "Revealed vote index is out of range.",
  ),
  AlreadyRevealed: err(
    BASE + 39,
    "AlreadyRevealed",
    "Juror has already revealed.",
  ),

  // --- finalization ---
  AppealWindowOpen: err(
    BASE + 40,
    "AppealWindowOpen",
    "Appeal window has not elapsed yet.",
  ),

  // --- appeals (ADR-0004) ---
  MaxAppealsReached: err(
    BASE + 41,
    "MaxAppealsReached",
    "Maximum appeals reached for this dispute.",
  ),
  MaxAppealsLimitExceeded: err(
    BASE + 42,
    "MaxAppealsLimitExceeded",
    "Subaccord max_appeals exceeds the program ceiling.",
  ),
  AppealWindowClosed: err(
    BASE + 43,
    "AppealWindowClosed",
    "Appeal window has closed; the dispute can only be finalized.",
  ),

  // --- finalization ---
  RoundNotFinalizable: err(
    BASE + 44,
    "RoundNotFinalizable",
    "Round cannot be finalized yet (window not elapsed).",
  ),
  DisputeNotFinal: err(
    BASE + 45,
    "DisputeNotFinal",
    "Dispute is not in a finalizable state.",
  ),

  // --- arithmetic ---
  ArithmeticOverflow: err(
    BASE + 46,
    "ArithmeticOverflow",
    "Arithmetic overflow.",
  ),
} as const;

export type AccordErrorName = keyof typeof AccordErrors;
