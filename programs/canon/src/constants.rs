//! Compile-time constants for Canon: canonical PDA seed prefixes (SPEC
//! account/seed table), the v1 canonical-default profile (SPEC §v1 canonical
//! defaults), and the domain ceilings consumed by `create_list` validation.
//!
//! The dispute-mechanism defaults (jurors, appeals, alpha, windows,
//! `fee_per_juror`) mirror Accord's v1 defaults — Canon initialises its 1:1
//! backing Subaccord with them at `create_list`. They are then controlled by the
//! Subaccord authority (NOT the list creator) and retunable via the 48h
//! propose/execute timelock (ADR-0005). The list-level defaults
//! (`submit_deposit`, `challenge_pct`, `listing_window`, `withdrawal_timelock`)
//! are stored on `CanonList`.

// --- Canonical PDA seed prefixes (SPEC account table) -----------------------
//
// CanonList:  ["canon", creator, rules_hash]
// CanonItem:  ["canon-item", list, account]

/// `CanonList` PDA seed prefix. Full seeds: `["canon", creator, rules_hash]`.
pub const SEED_CANON_LIST: &[u8] = b"canon";
/// `CanonItem` PDA seed prefix. Full seeds: `["canon-item", list, account]`.
pub const SEED_CANON_ITEM: &[u8] = b"canon-item";

// --- v1 canonical-default dispute-mechanism profile -------------------------
//
// Passed to Accord `create_subaccord` at `create_list`; mirror Accord's v1
// defaults (programs/accord/src/constants.rs). `initial_num_jurors` is Accord's
// *fixed* round-1 panel protocol constant (ADR-0019) — restated here as the
// canonical profile the backing Subaccord relies on, not a Subaccord parameter.

/// Round-1 juror panel size. Accord fixed protocol constant (ADR-0019); the
/// appeal ladder grows it via `2N+1`: 3 -> 7 -> 15 -> 31.
pub const INITIAL_NUM_JURORS: u32 = 3;
/// Default maximum appeals per dispute (3 -> 7 -> 15 -> 31 ladder).
pub const DEFAULT_MAX_APPEALS: u8 = 3;
/// Default alpha (slash factor) in basis points: 10%.
pub const DEFAULT_ALPHA_BPS: u16 = 1_000;
pub const DEFAULT_REVIEW_WINDOW_SECS: u64 = 7 * 24 * 60 * 60;
pub const DEFAULT_COMMIT_WINDOW_SECS: u64 = 2 * 24 * 60 * 60;
pub const DEFAULT_REVEAL_WINDOW_SECS: u64 = 2 * 24 * 60 * 60;
/// Default appeal window after a round resolves (Accord v1 default: 3 days).
pub const DEFAULT_APPEAL_WINDOW_SECS: u64 = 3 * 24 * 60 * 60;
/// Default per-juror fee, in `fee_mint` (round-1 ~= 30).
pub const DEFAULT_FEE_PER_JUROR: u64 = 10;

// --- v1 canonical-default list-level profile (stored on CanonList) ----------

/// Base skin-in-the-game a submitter locks at `submit_item`, in `fee_mint`.
/// Recoverable only via the withdrawal path.
pub const DEFAULT_SUBMIT_DEPOSIT: u64 = 500;
/// Challenger stakes this fraction (bps) of the item's `accumulated_stake`.
/// 5_000 bps = 50%.
pub const DEFAULT_CHALLENGE_PCT_BPS: u16 = 5_000;
/// Watcher time to catch a scam before an unchallenged item auto-lists.
pub const DEFAULT_LISTING_WINDOW_SECS: u64 = 5 * 24 * 60 * 60;
/// Final fraud-challenge window during a pending withdrawal (matches
/// `DEFAULT_LISTING_WINDOW_SECS`).
pub const DEFAULT_WITHDRAWAL_TIMELOCK_SECS: u64 = 5 * 24 * 60 * 60;

// --- Domain ceilings (consumed by `create_list` validation) -----------------

/// Ceiling on `CanonList.challenge_pct` (basis points). A challenger's stake
/// cannot exceed the item's accumulated stake, so 100% (10_000 bps) is the hard
/// upper bound.
pub const MAX_CHALLENGE_PCT_BPS: u16 = 10_000;

// --- Dispute options (SPEC §Instructions #4) ---------------------------------
//
// The two rulings Accord jurors choose between for a Canon challenge. The
// 32-byte values are opaque identifiers — only the index matters (0 = keep,
// 1 = remove) since `final_ruling` is a `u8` index into `Dispute.options`.

/// Option index 0: the item survives the challenge.
pub const OPTION_KEEP: [u8; 32] = {
    let mut a = [0u8; 32];
    a[0] = b'k';
    a
};
/// Option index 1: the item is removed.
pub const OPTION_REMOVE: [u8; 32] = {
    let mut a = [0u8; 32];
    a[0] = b'r';
    a
};
