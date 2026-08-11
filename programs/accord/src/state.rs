//! Account state structs for the Accord (SPEC account/PDA table).
//!
//! Every account stores its canonical `bump` so instruction handlers reuse the
//! same PDA (never re-derive). Large accounts (`Dispute`, `Round`) are
//! `Box<>`-wrapped at the instruction site to fit the BPF stack frame — the
//! structs themselves are plain `#[account]` types.

use crate::constants::{MAX_JURORS, MAX_OPTIONS, NUM_EVIDENCE_SLOTS};
use anchor_lang::prelude::*;

/// Dispute-kit aggregation rule (ADR-0019). v1 ships a single variant; future
/// variants (`RankedChoice`/IRV, `Median`) ship as new enum entries. The rule
/// is frozen onto `CaseTerms` at filing time and `finalize_round` tallies off
/// it (`match dispute.terms.aggregation`) — plurality today. The match carries
/// no wildcard arm, so adding a variant is a compile error until its tally arm
/// lands — the extension seam is real and machine-checked, not aspirational.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Aggregation {
    Plurality,
}

/// What happens when a round falls short of its reveal quorum (ADR-0021). v1
/// ships a single variant — `Redraw` reconvenes the same-size panel with fresh
/// seats (via an orthogonal `draw_attempt`), slashing the no-shows; after
/// `max_draw_attempts` the dispute transitions to `Failed`. Future variants
/// (e.g. `Fail`) ship as new enum entries.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ShortfallPolicy {
    Redraw,
}

/// A specialized Juror pool. Permissionless; `staking_token`, `fee_token`,
/// windows, `alpha`, `min_stake`, `fee_per_juror`, `authority`, and
/// `evidence_operator` are mutable via propose/execute (ADR-0005); `risk_type`
/// and `evidence_spec` are immutable.
///
/// Seeds: `["subaccord", creator, risk_type]`.
#[account]
#[derive(InitSpace)]
pub struct Subaccord {
    pub creator: Pubkey,
    pub staking_token: Pubkey, // SPL mint juror capital is staked in (collateral, ADR-0002/0020)
    /// Compensation mint — fees + appeal bonds (ADR-0020). Distinct from
    /// `staking_token` so collateral and compensation are decoupled.
    pub fee_token: Pubkey,
    pub min_stake: u64, // draw eligibility threshold, in `staking_token`
    /// Slash factor in basis points (10% = 1000). Incoherent Juror loses
    /// `alpha_bps * min_stake / 10_000` (flat — ADR-0003 consequence).
    pub alpha_bps: u16,
    pub review_window: u64, // seconds
    pub commit_window: u64, // seconds
    pub reveal_window: u64, // seconds
    /// Appeal window after a round resolves before the dispute goes final
    /// (ADR-0022). Per-Subaccord; frozen onto `CaseTerms` at filing.
    pub appeal_window: u64, // seconds
    pub max_appeals: u8,
    /// Per-Subaccord aggregation rule (ADR-0019). v1 = `Plurality`.
    pub aggregation: Aggregation,
    pub fee_per_juror: u64, // in `fee_token` (ADR-0020)
    /// Reveal-quorum fraction in basis points (ADR-0021). A round is
    /// authoritative only if `reveal_count >= ceil(panel × bps / 10_000)`.
    /// Default 6666 (= 2/3); the absolute commitment escalates per appeal for
    /// free via panel growth.
    pub reveal_threshold_bps: u16,
    /// What to do on a shortfall (ADR-0021). v1 = `Redraw`.
    pub shortfall_policy: ShortfallPolicy,
    /// Maximum same-size redraws per round before the dispute fails (ADR-0021).
    /// `(round_idx, draw_attempt)` with `draw_attempt` reaching this bound ⇒
    /// `Failed`. Orthogonal to `max_appeals` (which bounds `round_idx`).
    pub max_draw_attempts: u8,
    /// `Pubkey::default()` => immutable. Otherwise signs propose/execute updates.
    pub authority: Pubkey,
    pub evidence_operator: Pubkey, // ADR-0006 trusted re-encryption service
    /// Immutable identity hash: what class of dispute this pool adjudicates.
    pub risk_type: [u8; 32],
    /// Immutable evidence-format spec hash (ADR-0006).
    pub evidence_spec: [u8; 32],
    /// Attestation-gated juror pool (PROG-ATTESTTION). When both are
    /// `Pubkey::default()` the Subaccord is stake-only (today's behavior,
    /// unchanged). When set, jurors must hold a valid SAS attestation from
    /// `juror_credential` under `juror_schema` to stake and be drawn. Immutable
    /// at creation — joins `risk_type` + `evidence_spec` as the identity
    /// triplet (ADR-0005). Both-or-neither: a half-bound Subaccord is rejected
    /// at `create_subaccord` (`AttestationBindingPartial`).
    pub juror_credential: Pubkey,
    pub juror_schema: Pubkey,
    /// Count of **distinct Jurors with any stake** (`JurorStake.staked > 0`).
    /// Maintained O(1) by `stake`/`unstake` (0→positive increments,
    /// positive→0 decrements). This is a *coarse* intake gate for
    /// `create_dispute`/`appeal` (SPEC edge case: revert if fewer active
    /// distinct stakers than the required panel). It deliberately does NOT track
    /// `min_stake` eligibility — that changes via the 48h timelock and cannot be
    /// recomputed without the O(n) ledger ADR-0003 rejected. Precise eligibility
    /// (amount ≥ min_stake, distinctness) is verified at `draw` against the
    /// finalized Merkle Snapshot.
    pub staker_count: u32,
    /// On-chain stake accumulator root (ADR-0012). Maintained incrementally on
    /// every `stake`/`unstake` via client-supplied Merkle paths; canonical by
    /// construction — there is no posted root to withhold or fabricate.
    pub root_hash: [u8; 32],
    /// Total stake committed to by the accumulator tree (= root node sum).
    pub total_stake: u64,
    /// Next free leaf index in the append-only tree. Incremented once per
    /// first-time staker; never reused (full unstake zeros the leaf weight but
    /// keeps its `tree_index`).
    pub next_index: u32,
    /// Fixed tree depth (bounds the pool at `2^depth`). Set at `create_subaccord`.
    pub depth: u8,
    /// Parallel vault ledger — fee side (bean accord-fdad). Tracks every
    /// `fee_token` SPL transfer in/out of the `fee_vault`, independent of the
    /// vault's live balance. The vault balance is a *derivable consequence*:
    /// `fee_vault.amount == fee_vault_deposited - fee_vault_withdrawn`
    /// (separate-mint) or the fee portion of a shared ATA (same-mint).
    pub fee_vault_deposited: u64,
    pub fee_vault_withdrawn: u64,
    /// Parallel vault ledger — stake side (bean accord-fdad). Tracks every
    /// `staking_token` SPL transfer in/out of the `stake_vault`. Bumped only by
    /// `stake` (in) and `withdraw` (out); slashing and `request_withdraw` are
    /// ledger-only and never touch these.
    pub stake_vault_deposited: u64,
    pub stake_vault_withdrawn: u64,
    pub bump: u8,
}

/// A Juror's staked capital in a Subaccord. `unstake` reverts while
/// `active_draws > 0` (ADR-0003: stake frozen until every drawn dispute settles).
///
/// `tree_index` (ADR-0012) is the leaf position in the Subaccord's accumulator
/// tree, assigned once at first stake and never changed. A full unstake zeros
/// the leaf's selection weight but keeps the index, so re-staking is a local
/// update (O(log N)).
///
/// Seeds: `["stake", subaccord, juror]`.
#[account]
#[derive(InitSpace)]
pub struct JurorStake {
    pub subaccord: Pubkey,
    pub juror: Pubkey,
    /// Collateral (stake_token). Sortition weight + slash exposure.
    pub staked: u64,
    pub active_draws: u32, // disputes this juror is currently drawn into
    pub bump: u8,
    /// Leaf position in the Subaccord accumulator (assigned at first stake).
    pub tree_index: u32,
    /// Net slash(-)/reward(+) accumulated from settlements, in `stake_token`.
    /// Written by settlement instead of mutating `staked` — keeps the
    /// accumulator root canonical. Folded into `staked` by the permissionless
    /// `reconcile_stake` crank (which updates the root via a Merkle proof).
    pub stake_delta: i64,
    /// Pending slash exposure from all active draws. Incremented by
    /// `draw_seat` (by `α·min_stake` from the dispute's terms), decremented
    /// by settlement or cancel. Ensures the juror can always cover every
    /// concurrent slash. `staked - slash_reserve` is the truly free stake.
    pub slash_reserve: u64,
    /// Timestamp of `request_withdraw` (0 = no pending request). The
    /// accumulator root is already updated at request time; `withdraw` just
    /// transfers tokens after `WITHDRAWAL_DELAY` + `active_draws == 0`.
    pub withdraw_requested_at: i64,
    /// Tokens locked in the vault pending `withdraw`. Set at `request_withdraw`,
    /// consumed at `withdraw`.
    pub pending_withdrawal: u64,
    /// Aggregate earned fees (`fee_token`, ADR-0020). Credited at
    /// `finalize_round` + settlement; withdrawn via the ungated
    /// `withdraw_fees` instruction. No `active_draws` gate (fees are earned,
    /// not at-risk capital).
    pub fees_earned: u64,
}

/// Economics-relevant Subaccord params **frozen at `create_dispute` time**
/// (CONCEPT-REVIEW Ugly 6 / bean accord-4e7p). Every post-filing instruction
/// (`post_snapshot`, `draw`, `finalize_dispute`, `appeal`) reads this frozen
/// copy, never the live `Subaccord`. The 48h timelock (ADR-0005) then governs
/// only FUTURE disputes; an active case is immune to governance changes for
/// its entire life. This is the arbitration-contract principle: parties cannot
/// consent to a process whose economically load-bearing rules may shift
/// ex-post.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct CaseTerms {
    pub alpha_bps: u16,
    pub min_stake: u64,
    pub fee_per_juror: u64,
    pub review_window: u64,
    pub commit_window: u64,
    pub reveal_window: u64,
    /// Appeal window (ADR-0022). Per-Subaccord, frozen at filing.
    pub appeal_window: u64,
    pub max_appeals: u8,
    pub aggregation: Aggregation,
    /// Frozen reveal-quorum fraction (ADR-0021). Mirrors
    /// `Subaccord.reveal_threshold_bps` at filing time.
    pub reveal_threshold_bps: u16,
    /// Frozen shortfall policy (ADR-0021).
    pub shortfall_policy: ShortfallPolicy,
    /// Frozen redraw cap (ADR-0021).
    pub max_draw_attempts: u8,
}

/// A case filed by an Arbitrable. Progresses through [`DisputeState`]; the
/// Arbitrable reads `final_ruling` lazily.
///
/// Seeds: `["dispute", filer, nonce]`.
#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub subaccord: Pubkey,
    pub filer: Pubkey,
    pub nonce: u64,
    pub num_options: u8,
    pub options: [[u8; 32]; MAX_OPTIONS], // option label hashes
    /// Per-round evidence commitments (ADR-0006 / milestone accord-qp7c).
    /// Index 0 = round-0 (filing); each appeal round may optionally bring new
    /// evidence at `[current_round + 1]`. `[0u8; 32]` sentinel = no new
    /// evidence that round (jurors reuse prior rounds').
    pub evidence_hashes: [[u8; 32]; NUM_EVIDENCE_SLOTS],
    pub state: DisputeState,
    pub current_round: u32,
    /// Filing-time snapshot of the Subaccord's economics (Ugly 6). Immutable
    /// for the dispute's life; governance changes via ADR-0005 affect only
    /// disputes filed after the change lands.
    pub terms: CaseTerms,
    /// Winning option index once `state == Final`; `u8::MAX` until then.
    /// Sentinel (not `Option<u8>`): keeps the account fixed-size — the SBF
    /// `InitSpace` for `Option<u8>` undercounts its `Some` variant by 1 byte,
    /// which made `finalize_dispute`'s `Some` write overflow the account
    /// (Anchor `AccountDidNotSerialize` #3004). Mirrors `Round`'s u8::MAX
    /// sentinels for `reveals`/`result`.
    pub final_ruling: u8,
    /// Unix timestamp stamped at the single `Final` transition
    /// (`finalize_dispute`); `0` until then. Canonical "verdict time" anchor
    /// for downstream consumers (e.g. the Betline primitive's bettor reveal
    /// window, which must open exactly when the dispute finalizes). `0` is a
    /// safe sentinel: real Unix time is never 0 for on-chain disputes.
    pub finalized_at: i64,
    /// Round-0 filing fee deposited by the filer (`N · fee_per_juror` at
    /// creation). Decremented as round-0 jurors earn (`finalize_round`). This
    /// is the filer's refundable pool on cancel/redraw-exhaustion. Appeal-round
    /// fees live in their `AppealBond`, NOT here (bean accord-xftx).
    pub fee_paid: u64,
    /// VRF result committed once via `commit_vrf` (ADR-0009). `None` until
    /// committed; `Some(vrf_result)` after. The draw reads this; the caller
    /// cannot swap it between retries.
    pub committed_vrf: Option<[u8; 32]>,
    /// Accumulator root frozen atomically when the VRF lands in
    /// `commit_vrf_callback` (ADR-0012). All `draw_seat` calls for every round
    /// of this dispute select against this one root (per-seat coherence +
    /// manipulation resistance). `[0;32]` until frozen; readable once
    /// `committed_vrf.is_some()`.
    pub frozen_root: [u8; 32],
    /// Total stake captured with `frozen_root` at freeze time. Drives
    /// sortition (`r_i % frozen_total_stake`).
    pub frozen_total_stake: u64,
    /// Unix timestamp at `create_dispute` (Ugly 4). Drives the pre-draw
    /// `cancel_dispute` timeout: if the dispute has not been drawn within
    /// `PRE_DRAW_CANCEL_TIMEOUT_SECS`, any cranker may cancel + refund the filer.
    pub filed_at: i64,
    pub bump: u8,
}

/// Per-round draw/vote state. One `Round` per dispute round (initial + appeals).
///
/// Seeds: `["round", dispute, round_idx]`.
///
/// `#[zero_copy]`: `Round` is too large for BPF's 4096-byte stack when
/// deserialized via `Account<Round>`. Zero-copy maps the account data buffer
/// directly as the struct — no Borsh (de)serialization, no stack copy.
/// `reveals` and `result` use `u8::MAX` sentinels instead of `Option<u8>`
/// (which is not `Pod`). Fields are reordered (u32 first) + explicit padding
/// to satisfy `bytemuck::Pod` (no implicit gaps).
#[account(zero_copy)]
#[repr(C)]
pub struct Round {
    // --- u32 fields (4-byte aligned, no gaps) ---
    pub round_idx: u32,
    pub juror_count: u32,
    pub commit_count: u32,
    pub reveal_count: u32,
    // --- i64 window deadlines (8-byte aligned at offset 16) ---
    /// Commit opens at this timestamp (= draw_time + review_window).
    pub review_end: i64,
    /// Reveal opens at this timestamp (= review_end + commit_window).
    pub commit_end: i64,
    /// Round can be finalized after this timestamp (= commit_end + reveal_window).
    pub reveal_end: i64,
    // --- u8 fields ---
    pub result: u8, // u8::MAX = not set
    pub bump: u8,
    pub _pad0: [u8; 2], // align next field group to 4
    // --- byte arrays (1-byte aligned) ---
    pub dispute: Pubkey,
    pub jurors: [Pubkey; MAX_JURORS],
    /// `hash(vote, salt, juror_pubkey)` per drawn Juror; `[0;32]` until committed.
    pub commits: [[u8; 32]; MAX_JURORS],
    /// Revealed vote option index per drawn Juror; `u8::MAX` until revealed.
    pub reveals: [u8; MAX_JURORS],
    /// Whether this round's coherence settlement has been applied
    /// (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti). 0 until
    /// `finalize_dispute` (final round) or `settle_round` (prior rounds)
    /// processes it; 1 after. Idempotency guard against double-settlement.
    /// (`u8` not `bool` — `bool` is not `Pod`.)
    pub settled: u8,
    pub _pad1: [u8; 4], // align seat_prefix to 8
    /// Cumulative-from-left prefix per drawn seat (bean accord-tzo0). Filled
    /// when the seat lands; later seats read these to verify that every prior
    /// sortition retry genuinely collided with an already-drawn juror —
    /// eliminating caller choice (no draw_attempt grind).
    pub seat_prefix: [u64; MAX_JURORS],
    /// Leaf stake per drawn seat. With `seat_prefix`, defines the sortition
    /// range `[prefix, prefix+stake)` used for deterministic collision checks.
    pub seat_stake: [u64; MAX_JURORS], // total = multiple of 8
    /// Same-size redraw counter within this round (ADR-0021). Orthogonal to
    /// `round_idx`: bumping it changes only the sortition seed, never the panel
    /// size or the appeal budget. `(0,0)` = initial draw; resets implicitly on a
    /// new appeal round (fresh `Round` PDA keyed by the new `round_idx`).
    /// Appended (with trailing pad) so existing field offsets are stable.
    pub draw_attempt: u32,
    pub _pad_draw_attempt: [u8; 4], // keep struct size a multiple of 8 (Pod)
}

/// Custody record for a single appeal bond (ADR-0004). One `AppealBond` per
/// appeal, created by `appeal`, settled by `finalize_dispute` (forfeit on
/// no-flip) / `claim_appeal_refund` (return on flip). Storing the appeal state
/// here — rather than on `Dispute` — keeps the `Dispute` account small.
///
/// Seeds: `["bond", dispute, round_idx]` where `round_idx` is the round the
/// appeal opens (the larger panel).
///
/// `prior_result` is the winning option of the round the appellant sought to
/// flip (the just-resolved `current_round` at appeal time). Flip detection at
/// final settlement is `final_ruling != prior_result`. `amount` stores the
/// **total deposit** (appeal fee + bond); the appeal-fee portion is derived at
/// settlement as `panel_size_for_round(round_idx) *
/// fee_per_juror`. `claim_appeal_refund` ALWAYS returns only the bond — never
/// the appeal fee — regardless of terminal state (bean accord-xftx). The
/// appeal fee is owned by the round's jurors (credited as `fees_earned` if the
/// round resolved) or trapped in the vault if it never resolved. A no-flip bond
/// is zeroed (`amount = 0`) by `finalize_dispute` (bond forfeited into the
/// coherent fee pool); a flipped or unresolved bond keeps its `amount` until
/// `claim_appeal_refund` returns the bond portion and zeroes the record
/// (idempotent).
#[account]
#[derive(InitSpace)]
pub struct AppealBond {
    pub dispute: Pubkey,
    pub round_idx: u32,
    pub appellant: Pubkey,
    pub amount: u64,
    /// Winning option of the round being appealed (set at `appeal` time).
    pub prior_result: u8,
    pub bump: u8,
}

/// A proposed Subaccord parameter update, executable only after the 48h on-chain
/// timelock elapses (ADR-0005). No-op while `Subaccord.authority == default`.
///
/// Seeds: `["update", subaccord, nonce]`.
#[account]
#[derive(InitSpace)]
pub struct PendingUpdate {
    pub subaccord: Pubkey,
    pub nonce: u64,
    pub proposed: UpdatePayload,
    pub proposed_by: Pubkey, // == Subaccord.authority at propose time
    /// Earliest slot at which `execute_subaccord_update` may land.
    pub execute_after_slot: u64,
    pub bump: u8,
}

/// Program-level circuit breaker (ADR-0007). Singleton seeded `["pause"]`.
/// `pause()` is instant and authority-gated; `unpause()` is timelocked
/// (`propose_unpause` arms `pending_unpause_after`, `execute_unpause` lands
/// once the slot passes — permissionless, so a freeze is always recoverable on
/// a known schedule). When `paused`, `create_dispute` / `stake` / `appeal`
/// revert; in-flight disputes resolve normally.
#[account]
#[derive(InitSpace)]
pub struct PauseState {
    /// The multisig/upgrade-authority permitted to pause and propose unpause.
    pub authority: Pubkey,
    pub paused: bool,
    /// `Some(slot)` once `propose_unpause` has armed an unpause; cleared on
    /// `execute_unpause` (or on a fresh `pause`).
    pub pending_unpause_after: Option<u64>,
    pub bump: u8,
}

/// Dispute lifecycle (SPEC state machine). A permissionless crank advances
/// states when their windows elapse.
///
/// `Failed` is the liveness-escape terminal state (CONCEPT-REVIEW Ugly 4 /
/// bean accord-18fb): `cancel_dispute` transitions a stalled dispute here,
/// refunds the filer's round-1 fee, and releases the current round's
/// `active_draws`. It is terminal — no lifecycle instruction accepts it.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum DisputeState {
    Created,
    Drawn,
    Review,
    Commit,
    Reveal,
    RoundResolved, // round tallied; appeal window or finalization
    Final,         // final ruling set
    Closed,        // fully settled
    Failed,        // liveness-escape terminal (cancel_dispute / redraw exhaustion)
    /// Round fell short of its reveal quorum (ADR-0021). `redraw` reconvenes
    /// the same-size panel (bumping `draw_attempt`); on `max_draw_attempts`
    /// exhaustion the dispute transitions to `Failed` instead.
    RedrawEligible,
}

/// Grouped args for `create_subaccord`'s non-seed fields (bean accord-sqve).
/// `risk_type` / `evidence_spec` stay positional in the instruction signature
/// since `risk_type` drives the Subaccord PDA seed; everything else lands here
/// so the instruction avoids the `too_many_arguments` smell and the IDL exposes
/// a single named object instead of 14 positional scalars.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace, Debug)]
pub struct CreateSubaccordParams {
    pub min_stake: u64,
    pub alpha_bps: u16,
    pub review_window: u64,
    pub commit_window: u64,
    pub reveal_window: u64,
    pub appeal_window: u64,
    pub max_appeals: u8,
    pub aggregation: Aggregation,
    pub fee_per_juror: u64,
    /// Reveal-quorum fraction in bps (ADR-0021). Default 6666 (2/3).
    pub reveal_threshold_bps: u16,
    /// Shortfall policy (ADR-0021). v1 = `Redraw`.
    pub shortfall_policy: ShortfallPolicy,
    /// Redraw cap per round (ADR-0021). Default 3.
    pub max_draw_attempts: u8,
    pub authority: Pubkey,
    pub evidence_operator: Pubkey,
    pub depth: u8,
    /// Attestation credential binding (PROG-ATTESTTION). `Pubkey::default()`
    /// ⇒ stake-only (today's behavior). Both-or-neither with `juror_schema`.
    /// Immutable once set on the Subaccord; absent from `UpdatePayload`.
    pub juror_credential: Pubkey,
    pub juror_schema: Pubkey,
}

/// Tagged Subaccord parameter update. `risk_type` and `evidence_spec` are
/// immutable and intentionally absent (ADR-0005).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace, Debug)]
pub enum UpdatePayload {
    MinStake(u64),
    AlphaBps(u16),
    ReviewWindow(u64),
    CommitWindow(u64),
    RevealWindow(u64),
    AppealWindow(u64),
    MaxAppeals(u8),
    FeePerJuror(u64),
    Authority(Pubkey),
    EvidenceOperator(Pubkey),
}

// --- Draw (ADR-0012 accumulator; veridao-fr1x/veridao-4nyi) ------------------

/// Merkle-Sum Tree proof element (ADR-0012 subtree-sum form). Each level of the
/// proof carries the sibling subtree's hash AND its stake sum. Sums are bound
/// into every node hash, so stake-weighted ranges are cryptographically
/// authenticated (CONCEPT-REVIEW Bad 5 fixed by construction).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct MSTNode {
    pub sibling_hash: [u8; 32],
    pub sibling_sum: u64,
}

/// A drawn Juror's MST membership proof against the dispute's `frozen_root`:
/// the leaf claim `(juror, stake)`, the sibling nodes rootward, and the leaf's
/// position in the tree. The on-chain `draw_seat` verifies the proof against
/// the frozen root, reconstructs the cumulative-from-left prefix from the
/// authenticated sibling sums, enforces the sortition criterion
/// (`prefix ≤ r_i < prefix + stake`), and the inflation guard
/// (`JurorStake.amount ≥ leaf.stake`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct JurorMembership {
    pub leaf: LeafClaim,
    pub proof: Vec<MSTNode>,
    pub index: u32,
}

/// A single leaf of the subtree-sum accumulator (ADR-0012). The leaf is hashed
/// as `H(juror || stake_le)`. The cumulative-from-left prefix used for
/// sortition is reconstructed on-chain from the authenticated sibling sums
/// along the proof path (no `cum_after` carried on the leaf — the subtree-sum
/// form makes it derivable, unlike ADR-0009's O(N) cumulative form).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct LeafClaim {
    pub juror: Pubkey,
    pub stake: u64,
}
