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

// --- Manual Borsh layout pins ------------------------------------------------
//
// Host tests (`src/tests.rs`) and the e2e harness slice `SynodCase` at fixed
// data offsets (cheatcode writes, payout-math reads). Same caveats as the
// accord crate (see `programs/accord/src/constants.rs`):
//   - `core::mem::offset_of!` reflects in-memory layout, NOT the packed Borsh
//     wire format these offsets slice;
//   - Borsh layout is not `const fn`, so offsets can't be discovered in a
//     `const` context.
// What we do instead: (a) derive every offset from named field-width consts so
// the arithmetic is self-evident, and (b) compile-time-assert the last field
// still fits inside the account (`<= 8 + INIT_SPACE`, which IS derived from
// the real struct — catches a struct shrink at compile time). The
// authoritative tie of these offsets to the actual struct is the run-time test
// `tests::layout_tests::offsets_match_borsh` (serialize a fixture → check the
// bytes): a field reorder/resize that drifts these consts fails `cargo test`.
pub(crate) mod layout {
    use crate::state::SynodCase;
    use anchor_lang::Space;

    const DISC: usize = 8;
    const PUBKEY: usize = 32;
    const HASH: usize = 32;
    use crate::constants::MAX_PARTIES;

    // --- SynodCase (state.rs) ---
    // disc | subaccord | parties[7] | party_count | joined | stake | fee | join_deadline | evidence[7] | dispute | paid_out | state | bump
    const SC_PARTY_COUNT_W: usize = 1;
    const SC_JOINED_W: usize = 1;
    const SC_STAKE_W: usize = 8;
    const SC_FEE_W: usize = 8;
    const SC_DEADLINE_W: usize = 8;
    const SC_PAID_OUT_W: usize = 1;
    const SC_STATE_W: usize = 1;
    const SC_BUMP_W: usize = 1;

    pub(crate) const SC_PARTIES_OFF: usize = DISC + PUBKEY;
    pub(crate) const SC_PARTY_COUNT_OFF: usize = SC_PARTIES_OFF + MAX_PARTIES * PUBKEY;
    pub(crate) const SC_JOINED_OFF: usize = SC_PARTY_COUNT_OFF + SC_PARTY_COUNT_W;
    pub(crate) const SC_STAKE_OFF: usize = SC_JOINED_OFF + SC_JOINED_W;
    pub(crate) const SC_FEE_OFF: usize = SC_STAKE_OFF + SC_STAKE_W;
    pub(crate) const SC_DEADLINE_OFF: usize = SC_FEE_OFF + SC_FEE_W;
    pub(crate) const SC_EVIDENCE_OFF: usize = SC_DEADLINE_OFF + SC_DEADLINE_W;
    pub(crate) const SC_DISPUTE_OFF: usize = SC_EVIDENCE_OFF + MAX_PARTIES * HASH;
    pub(crate) const SC_PAID_OUT_OFF: usize = SC_DISPUTE_OFF + PUBKEY;
    pub(crate) const SC_STATE_OFF: usize = SC_PAID_OUT_OFF + SC_PAID_OUT_W;
    pub(crate) const SC_BUMP_OFF: usize = SC_STATE_OFF + SC_STATE_W;

    // Compile-time bounds check (strongest const check available for Borsh
    // offsets): the last field must fit inside a serialized account.
    // Catches a struct shrink; does NOT catch a wrong field — that's
    // `tests::layout_tests::offsets_match_borsh`.
    const _: () = assert!(SC_BUMP_OFF + SC_BUMP_W <= DISC + SynodCase::INIT_SPACE);
}
