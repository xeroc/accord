//! Compile-time constants for Synod: the canonical PDA seed prefix (SPEC
//! §Account/PDA model) and the party-roster bounds (SPEC §Open-time
//! validations).
//!
//! The dispute-mechanism parameters (jurors, fee_per_juror, aggregation, …)
//! are NOT restated here — Synod reads them from the hosting `Subaccord` at
//! `open_case` and freezes `fee` onto the `SynodCase` (never re-read).

use anchor_lang::prelude::*;

// --- Canonical PDA seed prefixes (SPEC account table) -----------------------
//
// SynodCase: ["case", opener, nonce]

/// `SynodCase` PDA seed prefix. Full seeds: `["case", opener, nonce]`.
pub const SEED_CASE: &[u8] = b"case";

// --- Party-roster bounds (SPEC §Open-time validations) ----------------------

/// Maximum party slots. Accord `MAX_OPTIONS = 8` leaves 7 party slots + 1
/// neutral option at the highest index.
pub const MAX_PARTIES: usize = 7;
/// Minimum party count (a dispute needs at least two sides).
pub const MIN_PARTIES: usize = 2;
