//! Compile-time constants for Canon: canonical PDA seed prefixes (SPEC
//! account/seed table), the v1 canonical-default list-level profile (SPEC §v1
//! canonical defaults), and the domain ceilings consumed by `create_list`
//! validation.
//!
//! The dispute-mechanism profile of the backing Subaccord is creator-supplied
//! at `create_list` (`CourtParams`, milestone accord-qz7d) — the canonical
//! default profile lives in the SDK (`defaultCourtParams()` in
//! `@useaccord/canon`), not here. Court-side ceilings Accord does not already
//! enforce at the `create_subaccord` CPI boundary live below; everything else
//! (appeals cap, jury parity, ladder fit, thresholds, draw attempts,
//! appeal-window floor) is Accord's job and its CPI errors propagate.

// --- Canonical PDA seed prefixes (SPEC account table) -----------------------
//
// CanonList:  ["canon", creator, rules_hash]
// CanonItem:  ["canon-item", list, account]

/// `CanonList` PDA seed prefix. Full seeds: `["canon", creator, rules_hash]`.
pub const SEED_CANON_LIST: &[u8] = b"canon";
/// `CanonItem` PDA seed prefix. Full seeds: `["canon-item", list, account]`.
pub const SEED_CANON_ITEM: &[u8] = b"canon-item";

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

/// Ceiling on `CourtParams.depth`. Each `stake`/`draw` tx carries a
/// depth-length `MSTNode` path (~40 B/level); at the canonical depth 8 the
/// stake tx is ~900 B, and each extra level eats further into the 1232-byte
/// packet budget. Raising this needs a measured draw-tx budget first
/// (follow-up bean). Tighter than Accord's own `depth <= 31` on purpose.
pub const MAX_LIST_TREE_DEPTH: u8 = 8;

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
