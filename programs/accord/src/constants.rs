//! Compile-time constants: account-size bounds, default economics, and the
//! canonical PDA seed prefixes (SPEC account/seed table).

/// Maximum Jurors per dispute panel. v1 appeal ladder is 3 -> 7 -> 15 -> **31**
/// (3rd appeal, `max_appeals = 3`); odd counts make full-reveal **binary** ties
/// impossible (≥3-option / non-reveal ties route to `RedrawEligible`, ADR-0026).
pub const MAX_JURORS: usize = 31;

/// Program-level ceiling on appeals per dispute. v1 appeal ladder (3 -> 7 -> 15
/// -> 31) caps at the 3rd appeal; a Subaccord may configure fewer via
/// `max_appeals`, but never more. Bounds the appeal-bond model + the
/// `create_subaccord` validation.
pub const MAX_APPEALS: usize = 3;

/// Number of per-round evidence slots on `Dispute.evidence_hashes` (milestone
/// accord-qp7c): slot 0 = filing, slots 1..=MAX_APPEALS = one per appeal round.
/// Declared as a named const (not `MAX_APPEALS + 1` inline) because anchor's
/// `InitSpace` + borsh derives require a single ident as the array length — a
/// binary const expression silently undercounts the declared size vs the real
/// borsh size and the account fails to deserialize after `init`.
pub const NUM_EVIDENCE_SLOTS: usize = MAX_APPEALS + 1;

/// Maximum vote options on a single Dispute. Bounds `Dispute.options` and the
/// per-round tally. Disputes need at least 2; 8 covers realistic
/// multiple-choice (binary / ternary / small-panel) while keeping the
/// `Dispute` account ~768 B smaller (8×32 vs 32×32) — enough that consumers
/// can use `Account<Dispute>` without blowing the SBF stack-frame budget.
pub const MAX_OPTIONS: usize = 8;

/// On-chain timelock a Subaccord parameter update must wait before execution
/// (ADR-0005). Expressed in slots (~400ms mainnet); 48h ~= 432_000 slots.
pub const UPDATE_TIMELOCK_SLOTS: u64 = 432_000;

/// Default Merkle accumulator tree depth (ADR-0012). 2^20 ≈ 1M seats; the
/// depth is fixed per-Subaccord at creation and bounds the pool size.
pub const DEFAULT_TREE_DEPTH: u8 = 20;

/// Default appeal window after a round is resolved, before the dispute becomes
/// final (SPEC state machine: RoundResolved →(appeal window)→ Final). 3 days.
/// Per-Subaccord since ADR-0022; this is only the `create_subaccord` default +
/// the "v1 default" the docs cite — the runtime value is
/// `dispute.terms.appeal_window` (frozen at filing).
pub const DEFAULT_APPEAL_WINDOW_SECS: u64 = 3 * 24 * 60 * 60;

/// Floor on the per-Subaccord appeal window (ADR-0022). Rejects 0 so the appeal
/// safety valve cannot be silently disabled by a forgotten field; a pool that
/// truly wants no appeals sets `max_appeals == 0` (the explicit knob). 1 hour.
pub const MIN_APPEAL_WINDOW_SECS: u64 = 3_600;

/// `cancel_dispute` liveness-escape timeouts (CONCEPT-REVIEW Ugly 4).
///
/// Pre-draw: max seconds a dispute may sit in `Created` (no VRF commit under
/// usable snapshot, no VRF commit) before any cranker may cancel + refund. 3
/// days — the snapshot + VRF steps should land in minutes; this is a generous
/// backstop against a dead indexer/oracle.
pub const PRE_DRAW_CANCEL_TIMEOUT_SECS: i64 = 3 * 24 * 60 * 60;

/// Post-draw grace: seconds after `round.reveal_end + terms.appeal_window`
/// before a stuck drawn round (never finalized) becomes cancelable. 3 days —
/// long enough for any reasonable cranker to land `finalize_round` +
/// `finalize_dispute`/`appeal`, short enough that funds are not locked
/// indefinitely.
pub const POST_DRAW_CANCEL_GRACE_SECS: i64 = 3 * 24 * 60 * 60;

/// Two-phase withdraw timelock (REVIEW #5). `request_withdraw` updates the
/// accumulator root immediately (juror exits the sortition pool); `withdraw`
/// transfers tokens only after this delay elapses AND `active_draws == 0`.
/// Set equal to `PRE_DRAW_CANCEL_TIMEOUT_SECS` so that any dispute which froze
/// a root before the request has either completed its draw (juror not selected)
/// or become cancelable (stuck seat) by the time the timelock expires.
pub const WITHDRAWAL_DELAY: i64 = PRE_DRAW_CANCEL_TIMEOUT_SECS;

/// Timelock on `execute_unpause` (ADR-0007): a paused program cannot be
/// unpaused without a notice period. 24h in slots (~400ms mainnet).
pub const UNPAUSE_TIMELOCK_SLOTS: u64 = 24 * 60 * 60 / 400;

// --- Canonical PDA seed prefixes (SPEC account table) -----------------------

pub const SEED_SUBACCORD: &[u8] = b"subaccord";
pub const SEED_JUROR_STAKE: &[u8] = b"stake";
pub const SEED_DISPUTE: &[u8] = b"dispute";
pub const SEED_ROUND: &[u8] = b"round";
pub const SEED_PENDING_UPDATE: &[u8] = b"update";
/// Per-appeal bond custody (ADR-0004). Seeds: `["bond", dispute, round_idx]`.
pub const SEED_APPEAL_BOND: &[u8] = b"bond";
/// `AccordState` singleton (ADR-0007 circuit breaker). Seed renamed
/// `b"pause"` → `b"state"` pre-mainnet (2026-08-14) — the PDA moved; devnet
/// requires redeploy + re-init. Type renamed `PauseState` → `AccordState`
/// with a fresh discriminator (no pin — reset accepted).
pub const SEED_ACCORD_STATE: &[u8] = b"state";

// --- v1 default economics (per-Subaccord configurable; these are the
//     milestone defaults table) ----------------------------------------------

/// Default round-1 juror panel size (accord-9q3e supersedes ADR-0019's fixed
/// constant). The runtime panel is per-Subaccord (`Subaccord.min_jury_size`,
/// default = this constant); the appeal ladder grows it via `2N+1`:
/// 3 → 7 → 15 → 31 (the last exactly fills `MAX_JURORS` at `max_appeals = 3`).
/// Kept as the SDK/CLI default for `min_jury_size`.
pub const INITIAL_NUM_JURORS: u32 = 3;
/// Default alpha (slash factor) in basis points: 10%.
pub const DEFAULT_ALPHA_BPS: u16 = 1_000;
pub const DEFAULT_REVIEW_WINDOW_SECS: u64 = 7 * 24 * 60 * 60;
pub const DEFAULT_COMMIT_WINDOW_SECS: u64 = 2 * 24 * 60 * 60;
pub const DEFAULT_REVEAL_WINDOW_SECS: u64 = 2 * 24 * 60 * 60;
pub const DEFAULT_MAX_APPEALS: u8 = 3;

/// Default reveal-quorum fraction in basis points (ADR-0021): 6666 = 2/3. A
/// round is authoritative only once `reveal_count >= ceil(panel × bps / 10_000)`.
/// The absolute commitment escalates per appeal for free via panel growth.
pub const DEFAULT_REVEAL_THRESHOLD_BPS: u16 = 6_666;

/// Default maximum same-size redraws per round before the dispute fails
/// (ADR-0021). Orthogonal to `MAX_APPEALS` (which bounds appeal rounds).
pub const DEFAULT_MAX_DRAW_ATTEMPTS: u8 = 3;

/// Default coherence tolerance for `Median` pools (ADR-0025): a revealed
/// scalar vote is coherent iff `|vote − ruling| · 10_000 ≤ ruling · 100`,
/// i.e. within ±1% of the final median. Scale-free, so it works for any
/// settlement-mint decimals. Inert for `Plurality` pools.
pub const DEFAULT_COHERENCE_TOL_BPS: u16 = 100;
/// Program ceiling on per-round redraw attempts (bounds the redraw ladder).
pub const MAX_DRAW_ATTEMPTS: u8 = 10;
/// Same-mint slash-dominance margin (ADR-0029): where `staking_token ==
/// fee_token`, creation + both update gates enforce
/// `α·min_stake/10_000 ≥ MIN_SLASH_FEE_RATIO · fee_per_juror`. Ratio 2 = the
/// pre-0029 binary-P bound, kept (not the post-0029 theoretical 1) as margin —
/// coherent-pool shares are endogenous (forfeited bonds) and widen the
/// lucky-noise edge. Split-mint pools are explicitly NOT numerically checked
/// (units are incommensurable; the 2026-08-31 reverted gate is the recorded
/// proof) — operator/governance discipline governs those.
pub const MIN_SLASH_FEE_RATIO: u64 = 2;

/// Maximum sortition retries per seat in `draw_seat` (bean accord-tzo0). The
/// deterministic collision re-roll increments this counter until the selected
/// leaf is not an already-drawn juror.
///
/// L-5 (security review 2026-09-23): this must be a bound one `draw_seat`
/// instruction can actually reach inside the 1.4M CU per-instruction cap —
/// each retry is one sha256 syscall plus a collision scan, so the old 1024
/// was unreachable (chains that long died on CU exhaustion, never reaching
/// the `MaxRetriesExceeded` error). 128 keeps the worst-case loop comfortably
/// under the cap on mainnet metering (LiteSVM measures ~220 CU/retry;
/// mainnet's sha256 syscall fee is an order of magnitude higher — either way
/// 128 fits) and still admits ~99.8 %-whale pools, where the expected chain
/// is ~450. Beyond it the dispute exits via the pre-draw `cancel_dispute`
/// timeout — crankers CANNOT raise the CU cap past 1.4M, so don't promise it.
pub const MAX_SORTITION_RETRIES: u32 = 128;
