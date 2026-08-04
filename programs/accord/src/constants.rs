//! Compile-time constants: account-size bounds, default economics, and the
//! canonical PDA seed prefixes (SPEC account/seed table).

/// Maximum Jurors per dispute panel. v1 appeal ladder is 3 -> 7 -> 15 -> **31**
/// (3rd appeal, `max_appeals = 3`); odd counts make ties impossible.
pub const MAX_JURORS: usize = 31;

/// Maximum vote options on a single Dispute. Bounds `Dispute.options` and the
/// per-round tally. Disputes need at least 2; 32 covers realistic multiple-choice.
pub const MAX_OPTIONS: usize = 32;

/// On-chain timelock a Subaccord parameter update must wait before execution
/// (ADR-0005). Expressed in slots (~400ms mainnet); 48h ~= 432_000 slots.
pub const UPDATE_TIMELOCK_SLOTS: u64 = 432_000;

/// Snapshot fraud-proof challenge window (ADR-0003): 1 day, in seconds.
pub const SNAPSHOT_CHALLENGE_WINDOW_SECS: i64 = 24 * 60 * 60;

/// Appeal window after a round is resolved, before the dispute becomes final
/// (SPEC state machine: RoundResolved →(appeal window)→ Final). 3 days.
pub const APPEAL_WINDOW_SECS: i64 = 3 * 24 * 60 * 60;

/// Timelock on `execute_unpause` (ADR-0007): a paused program cannot be
/// unpaused without a notice period. 24h in slots (~400ms mainnet).
pub const UNPAUSE_TIMELOCK_SLOTS: u64 = 24 * 60 * 60 / 400;

// --- Canonical PDA seed prefixes (SPEC account table) -----------------------

pub const SEED_SUBACCORD: &[u8] = b"subaccord";
pub const SEED_JUROR_STAKE: &[u8] = b"stake";
pub const SEED_DISPUTE: &[u8] = b"dispute";
pub const SEED_ROUND: &[u8] = b"round";
pub const SEED_SNAPSHOT: &[u8] = b"snapshot";
pub const SEED_PENDING_UPDATE: &[u8] = b"update";
/// Singleton program-level pause flag (ADR-0007 circuit breaker).
pub const SEED_PAUSE: &[u8] = b"pause";

// --- v1 default economics (per-Subaccord configurable; these are the
//     milestone defaults table) ----------------------------------------------

pub const DEFAULT_JURORS_PER_DISPUTE: u32 = 3;
/// Default alpha (slash factor) in basis points: 10%.
pub const DEFAULT_ALPHA_BPS: u16 = 1_000;
pub const DEFAULT_REVIEW_WINDOW_SECS: u64 = 7 * 24 * 60 * 60;
pub const DEFAULT_COMMIT_WINDOW_SECS: u64 = 2 * 24 * 60 * 60;
pub const DEFAULT_REVEAL_WINDOW_SECS: u64 = 2 * 24 * 60 * 60;
pub const DEFAULT_MAX_APPEALS: u8 = 3;
