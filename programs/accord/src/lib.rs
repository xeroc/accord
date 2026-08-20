//! # Accord
//!
//! General-purpose, Schelling-point-based decentralized arbitration accord on
//! Solana. Standalone primitive — the "Kleros of Solana." Any program can file
//! a Dispute; the Accord draws stake-weighted Jurors (VRF), collects
//! commit-reveal votes, and emits Rulings governed by coherence incentives.
//!
//! ## Program surface (v1 target)
//!
//! - `create_subaccord` — permissionless specialized juror pool (staking token,
//!   min stake, review/commit/reveal windows, alpha slash factor)
//! - `stake` / `unstake` — juror capital into a Subaccord (USDC in v1)
//! - `create_dispute` — the **Arbitrable** CPI entry: subaccord, options,
//!   evidence hash, fee → dispute id
//! - `draw` — random stake-weighted juror selection (VRF)
//! - `commit` / `reveal` — `hash(vote, salt)` then `{vote, salt}`
//! - `appeal` — escalate to 2N+1 jurors; losing party posts an appeal bond
//! - `execute_ruling` — write the winning option; lazy-read by the filer
//!
//! ## Spec authority
//!
//! - `PROJECT.md` (rationale), `CONTEXT.md` (domain language), `programs/accord/SPEC.md` (build spec)
//! - `docs/adr/0001` Schelling, `0002` per-Subaccord staking token, `0003` draw,
//!   `0004` party-agnostic, `0005` Subaccord authority, `0006` evidence, `0007` upgrade
//!
//! Build order: this program ships FIRST. Client programs (the Arbitrable)
//! integrate via the Arbitrable CPI.
use anchor_lang::prelude::*;

pub mod attestation;
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod pda;
pub mod state;
pub mod utils;

#[cfg(test)]
mod tests;

pub use constants::*;
pub use errors::AccordError;
pub use events::*;
pub use instructions::*;
pub use pda::*;
pub use state::*;

// `crate::layout` alias: bodies and utils slice raw accounts via full
// `crate::layout::<FIELD>` paths (CU-opt field writes).
pub(crate) use constants::layout;

// Program id for the Accord. (`anchor build` normally provisions this; it is
// blocked by the platform-tools/edition2024 toolchain issue — see AGENTS.md —
// so the keypair was generated with `solana-keygen` into target/deploy/.)
declare_id!("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed");

#[program]
pub mod accord {
    use super::*;

    /// Liveness probe and LiteSVM harness anchor (veridao-8ys4).
    ///
    /// No state, no accounts — returns `Ok(())` and emits a version event.
    /// Arbitrables / ops may call it to confirm the program is reachable. It
    /// exists so the testing harness has a trivial instruction to round-trip;
    /// every subsequent instruction ships with its own LiteSVM `#[test]`.
    pub fn health(_ctx: Context<Health>) -> Result<()> {
        Health::handler_health(_ctx)
    }

    // --- Circuit breaker (ADR-0007; veridao-63v3; scope split ADR-0016) ---
    // `pause` is instant + authority-gated; `unpause` is timelocked
    // (propose_unpause arms it, execute_unpause lands after the notice slot).
    // Split scope: while paused, only create_dispute / stake revert (new
    // exposure); appeal + finalize_dispute are never pausable, so in-flight
    // disputes always resolve and the pause authority cannot select an
    // adjudicative outcome. The halt is enforced inside create_dispute and
    // stake (`require!(!accord_state.paused, ProgramPaused)`); this module only
    // owns the breaker itself.

    /// One-time init of the pause singleton. The caller becomes the pause
    /// authority (typically the Squads multisig / upgrade authority). Call at
    /// deploy; front-running is an ops concern (bundle init with deploy).
    pub fn initialize_pause(ctx: Context<InitializePause>) -> Result<()> {
        InitializePause::handler_initialize_pause(ctx)
    }

    /// Instant, authority-gated emergency freeze.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        Pause::handler_pause(ctx)
    }

    /// Authority-gated: arms an unpause executable after `UNPAUSE_TIMELOCK_SLOTS`.
    pub fn propose_unpause(ctx: Context<ProposeUnpause>) -> Result<()> {
        ProposeUnpause::handler_propose_unpause(ctx)
    }

    /// Permissionless crank: lands the unpause once the notice slot has passed.
    pub fn execute_unpause(ctx: Context<ExecuteUnpause>) -> Result<()> {
        ExecuteUnpause::handler_execute_unpause(ctx)
    }

    // --- Subaccord management (ADR-0005; veridao-ek65) ---

    /// Permissionless creation of a specialized Juror pool. Seeds
    /// `["subaccord", creator, domain_ref]`, so each creator owns a private
    /// namespace per `domain_ref`. `domain_ref` + `evidence_spec` are immutable
    /// identity hashes; every other param routes through propose/execute
    /// (ADR-0005). `authority == Pubkey::default()` => immutable.
    pub fn create_subaccord(
        ctx: Context<CreateSubaccord>,
        domain_ref: [u8; 32],
        evidence_spec: [u8; 32],
        params: CreateSubaccordParams,
    ) -> Result<()> {
        CreateSubaccord::handler_create_subaccord(ctx, domain_ref, evidence_spec, params)
    }

    /// Stake Juror capital into a Subaccord. SPL-transfers `amount` of the
    /// Subaccord's `staking_token` from the Juror's ATA into the Subaccord
    /// PDA's stake_vault ATA (lazily created on first stake). The `JurorStake` PDA is
    /// init'd on first stake and topped up on subsequent stakes.
    ///
    /// ADR-0012: the caller supplies the juror's accumulator Merkle `path`. The
    /// chain verifies it against the stored root, credits the **actual delta**
    /// the vault received (fee-on-transfer safe), and recomputes the path to a
    /// new canonical root — O(log N). A wrong (stale/fabricated) path reverts,
    /// leaving the root untouched. Reverts while the circuit breaker is paused.
    pub fn stake(ctx: Context<Stake>, amount: u64, path: Vec<MSTNode>) -> Result<()> {
        Stake::handler_stake(ctx, amount, path)
    }

    /// **Phase 1 of two-phase withdraw** (REVIEW #5): declares intent to
    /// withdraw `amount` tokens. Ledger-only — no SPL transfer (that is
    /// `withdraw`'s job). Updates the accumulator root immediately (juror's
    /// sortition weight drops right away), reduces `JurorStake.staked`, and
    /// banks the tokens in `pending_withdrawal` until `withdraw` executes.
    ///
    /// ADR-0012: the caller supplies the juror's accumulator Merkle `path`; the
    /// chain verifies it against the stored root and recomputes a new root for
    /// the reduced leaf stake. A full unstake zeros the leaf's selection weight
    /// but retains its `tree_index` (re-stake is a local update).
    ///
    /// **Precondition (DRY with `reconcile_stake`):** `stake_delta` must be
    /// zero. Pending reward/slash is folded into `staked` by the permissionless
    /// `reconcile_stake` crank — call it first. Without this invariant a pending
    /// reward inflated `free_stake` past what `staked` could honor, so the
    /// subtraction underflowed. Withdraw only operates on a canonical ledger.
    ///
    /// Gates: `amount ≤ staked − slash_reserve` (free stake; the reserve covers
    /// in-flight draw slashes). No `active_draws` gate here — that lock is
    /// enforced at `withdraw`. Allowed while the program is paused (ADR-0007:
    /// only create_dispute / stake are halted — capital is never trapped).
    pub fn request_withdraw(
        ctx: Context<RequestWithdraw>,
        amount: u64,
        path: Vec<MSTNode>,
    ) -> Result<()> {
        RequestWithdraw::handler_request_withdraw(ctx, amount, path)
    }

    /// **Phase 2 of two-phase withdraw** (REVIEW #5): transfers locked tokens
    /// from the stake_vault to the juror's ATA. Requires `WITHDRAWAL_DELAY` to have
    /// elapsed since `request_withdraw` AND `active_draws == 0`.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        Withdraw::handler_withdraw(ctx)
    }

    /// **Permissionless crank** (REVIEW #4): folds a juror's `stake_delta`
    /// into their canonical `staked` and updates the accumulator root via a
    /// Merkle proof. After reconcile, the ledger and accumulator agree again.
    ///
    /// Any caller may trigger this — no tokens move, it's pure ledger + root
    /// accounting. The cranker supplies the juror's Merkle path (same format as
    /// `stake`/`unstake`), which authenticates the old leaf against the stored
    /// root and recomputes a new root for the adjusted amount.
    pub fn reconcile_stake(ctx: Context<ReconcileStake>, path: Vec<MSTNode>) -> Result<()> {
        ReconcileStake::handler_reconcile_stake(ctx, path)
    }

    /// Permissionless crank (PROG-ATTESTTION): evicts an **expired-credential**
    /// juror from a gated Subaccord's accumulator. Without it, an expired juror
    /// still in the tree is a dead zone — if the VRF lands on them, `draw_seat`
    /// reverts at the freshness check and the cranker cannot advance. Anyone
    /// may call; the caller supplies the juror's Merkle `path` + the expired
    /// SAS attestation in `remaining_accounts[0]`.
    ///
    /// The body mirrors `request_withdraw` for the **full** `staked` amount:
    /// zeros the leaf's selection weight, recomputes the root, banks the tokens
    /// into `pending_withdrawal`, and decrements `staker_count`. The juror then
    /// completes the normal two-phase `withdraw` (or re-stakes with a renewed
    /// attestation). Only the trigger + signer differ from `request_withdraw`:
    /// the caller signs (permissionless), the juror does not — so `PruneJuror`
    /// is its own account struct, not `RequestWithdraw`.
    ///
    /// Gates: gated Subaccords only; the attestation must have a real expiry
    /// (`!= 0`) that has passed (`<= now`) — a never-expiring credential can
    /// never be pruned. Banking the full stake requires no outstanding slash
    /// reserve (⇔ no in-flight draws), so a drawn juror settles those first.
    pub fn prune_juror(ctx: Context<PruneJuror>, path: Vec<MSTNode>) -> Result<()> {
        PruneJuror::handler_prune_juror(ctx, path)
    }

    /// **Permissionless crank** (RECLAIM-LEAF): pushes a fully-drained
    /// JurorStake's `tree_index` onto the free list, blanking the leaf identity
    /// to `(Pubkey::default(), 0)`. This recycles the tree slot for reuse by a
    /// new staker — closing the permanent-DoS hole where `next_index` only ever
    /// grows and can be exhausted by a griefing attacker.
    ///
    /// Preconditions: the juror must be fully drained (`staked == 0`,
    /// `active_draws == 0`, `stake_delta == 0`, `fees_earned == 0`,
    /// `pending_withdrawal == 0` — the last because the slot pop closes the
    /// account that custodies the banked withdrawal; H-1, security review
    /// 2026-08-19). A double reclaim is prevented by root verification (see
    /// handler comment).
    ///
    /// Any caller may trigger this — no tokens move, it's pure ledger + root
    /// accounting. The cranker supplies the juror's Merkle path.
    pub fn reclaim_slot(ctx: Context<ReclaimSlot>, path: Vec<MSTNode>) -> Result<()> {
        ReclaimSlot::handler_reclaim_slot(ctx, path)
    }

    // --- Subaccord authority / timelock (ADR-0005; veridao-y63e) ---

    /// Authority-gated proposal of a Subaccord parameter update. The update is
    /// written to a `PendingUpdate` PDA keyed by `(subaccord, nonce)` and becomes
    /// executable only after `UPDATE_TIMELOCK_SLOTS` (48h) elapses — giving
    /// stakers a window to unstake before a change lands. No-op for immutable
    /// Subaccords (`authority == default`). The nonce is caller-chosen; PDA
    /// `init` enforces uniqueness (a reused nonce simply fails to init).
    pub fn propose_subaccord_update(
        ctx: Context<ProposeSubaccordUpdate>,
        nonce: u64,
        payload: UpdatePayload,
    ) -> Result<()> {
        ProposeSubaccordUpdate::handler_propose_subaccord_update(ctx, nonce, payload)
    }

    /// Permissionless crank: applies a timelocked `PendingUpdate` to its Subaccord
    /// once the 48h notice slot has passed. Anyone may execute — the timelock is
    /// the protection, not the executor. The `PendingUpdate` is closed (rent to
    /// the caller) once applied.
    pub fn execute_subaccord_update(ctx: Context<ExecuteSubaccordUpdate>) -> Result<()> {
        ExecuteSubaccordUpdate::handler_execute_subaccord_update(ctx)
    }

    // --- Dispute intake & Snapshot trust (ADR-0003/0004; veridao-rrxs) ---

    /// The **Arbitrable CPI entry**: any program files a Dispute. The filer pays
    /// the full round-1 fee (`min_jury_size · fee_per_juror`) into the
    /// Subaccord vault, so the on-chain fee is authoritative — the caller's
    /// `fee` must match exactly (defense-in-depth: the filer signs the exact
    /// charge). Reverts while paused (ADR-0007) and if the Subaccord has fewer
    /// distinct stakers than the required panel (`staker_count` coarse gate;
    /// ADR-0003 snapshot does the precise eligibility check at draw).
    pub fn create_dispute(
        ctx: Context<CreateDispute>,
        options: Vec<[u8; 32]>,
        evidence_hash: [u8; 32],
        nonce: u64,
        fee: u64,
    ) -> Result<()> {
        CreateDispute::handler_create_dispute(ctx, options, evidence_hash, nonce, fee)
    }

    // --- Draw (ADR-0012 accumulator; veridao-fr1x/veridao-4nyi) -----------------

    /// Request VRF randomness from the magicblock oracle (ADR-0009/veridao-crbf).
    /// CPIs into the VRF program, which calls back `commit_vrf_callback` with
    /// the verified random value AND atomically freezes the accumulator root.
    /// Permissionless — any cranker may request. One-shot per dispute (errors
    /// if `committed_vrf` already set). No snapshot step (ADR-0012): the
    /// dispute goes straight from `Created` to a frozen root at callback time.
    pub fn request_vrf(ctx: Context<RequestVrf>) -> Result<()> {
        RequestVrf::handler_request_vrf(ctx)
    }

    /// VRF callback: stores the oracle-verified random value (ADR-0009) AND
    /// atomically freezes the accumulator root (ADR-0012). ONLY the VRF program
    /// can call this — `vrf_program_identity` is constrained to the scoped
    /// per-program identity `scoped_vrf_identity(&crate::ID)` (ADR-0013), not
    /// the deprecated global constant. Freezing here (not at `create_dispute`) closes
    /// the manipulation window: pre-callback the VRF is blind, post-callback
    /// the root is inert. One VRF + one frozen root serve the whole dispute.
    pub fn commit_vrf_callback(
        ctx: Context<CommitVrfCallback>,
        randomness: [u8; 32],
    ) -> Result<()> {
        CommitVrfCallback::handler_commit_vrf_callback(ctx, randomness)
    }

    /// Draw a single seat against the frozen accumulator root (ADR-0012). The
    /// 1232-byte tx packet cannot hold N Merkle proofs, so the panel is filled
    /// one seat per transaction; the round is `init_if_needed` and persists
    /// across the N `draw_seat` calls.
    ///
    /// The chain is a dumb verifier: it checks the membership proof against
    /// `dispute.frozen_root`, reconstructs the cumulative-from-left prefix from
    /// the authenticated sibling sums, enforces the sortition criterion
    /// (`prefix ≤ r_i < prefix + stake`, where `r_i` is deterministically
    /// derived from the frozen VRF + seat index + retry counter), the inflation
    /// guard (`JurorStake.staked ≥ leaf.stake`), and distinctness vs already-drawn
    /// seats.
    ///
    /// **Deterministic collision re-roll** (bean accord-tzo0): the cranker
    /// supplies `retries` — how many times the deterministic `r_i` landed on an
    /// already-drawn juror before hitting the submitted leaf. The chain verifies
    /// every prior retry (0..retries) genuinely collided with a drawn seat's
    /// range (stored in `round.seat_prefix`/`seat_stake`), eliminating caller
    /// choice. One seed → exactly one valid panel; no `draw_attempt` grind.
    /// When the last seat lands, the round windows open and the dispute
    /// transitions to `Drawn`.
    pub fn draw_seat(
        ctx: Context<DrawSeat>,
        seat: u32,
        retries: u32,
        membership: JurorMembership,
    ) -> Result<()> {
        DrawSeat::handler_draw_seat(ctx, seat, retries, membership)
    }

    // --- Voting & Ruling (veridao-pq1s) ---------------------------------------

    /// Commit a vote hash. `h = hash(vote_le ‖ salt ‖ juror_pubkey)` where
    /// `vote_le` is the vote's 8-byte little-endian encoding — the juror's
    /// pubkey is bound into the hash to prevent commit-copying (a juror who
    /// copies another's hash can never reveal it). One per drawn Juror;
    /// immutable after commit. Allowed during the commit window
    /// (`review_end ≤ now < commit_end`). The **last** commit (panel full)
    /// flips straight to `Reveal`, opening reveal early — all votes are then
    /// bound, so the commit/reveal separation has nothing left to protect.
    pub fn commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
        Commit::handler_commit(ctx, commitment)
    }

    /// Reveal a committed vote. Verifies `hash(vote_le ‖ salt ‖ juror_pubkey)`
    /// matches the stored commit, records the vote. ADR-0020: vote-recording
    /// only — no fee credit, no SPL transfer. The participation fee is credited
    /// to `JurorStake.fees_earned` at `finalize_round` instead (aggregated, not
    /// per-reveal ATA creation). Allowed once `now ≥ commit_end`, OR as soon as
    /// every juror has committed (early reveal — the panel-full commit flips
    /// state to `Reveal`), through `reveal_end`.
    ///
    /// ADR-0025: the vote is a `u64`. `Plurality` disputes bound it to the
    /// option range (`vote < num_options`); `Median` (scalar) disputes accept
    /// any fixed-point value except the `u64::MAX` no-reveal sentinel —
    /// jurors encode e.g. `123.45` USDC as `123_450_000` (settlement-mint
    /// decimals, applied client-side; the chain is scale-agnostic).
    pub fn reveal(ctx: Context<Reveal>, vote: u64, salt: [u8; 32]) -> Result<()> {
        Reveal::handler_reveal(ctx, vote, salt)
    }

    /// Permissionless crank: once the reveal window elapses **or every juror
    /// has revealed** (early resolve — all votes are bound, nothing left to
    /// wait for), tallies the round. ADR-0021 gates the tally on a reveal
    /// quorum; ADR-0026 gates it on decisiveness:
    ///
    /// - **Quorum met** (`reveal_count >= ceil(panel × threshold_bps / 10_000)`)
    ///   **and decisive**: credits each revealer's `fees_earned` (ADR-0020),
    ///   sets the tally result per `terms.aggregation` — the plurality winner
    ///   (option index; a top-count tie is non-decisive, see below) or the
    ///   **median** of the revealed scalar votes (ADR-0025) — and transitions
    ///   to `RoundResolved` (appeal window / final).
    /// - **Quorum not met, or a Plurality top-count tie** (≥2 options share the
    ///   max count — odd panels only prevent binary full-reveal ties):
    ///   no credits, no result — transitions to `RedrawEligible` so the
    ///   `redraw` crank can reconvene the panel (or, on `max_draw_attempts`
    ///   exhaustion, fail the dispute).
    ///
    /// The drawn `JurorStake` PDAs are `remaining_accounts` (mut), verified
    /// against the round's juror list + PDA derivation; they are only consumed
    /// on the quorum-met path.
    pub fn finalize_round(ctx: Context<FinalizeRound>) -> Result<()> {
        FinalizeRound::handler_finalize_round(ctx)
    }

    /// Permissionless crank: once the appeal window elapses without an appeal,
    /// writes `final_ruling` and settles the **final round's** economics
    /// (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti, ADR-0020 two-mint). Prior
    /// rounds are settled separately by `settle_round` cranks (≤31 juror
    /// accounts each).
    ///
    /// Settlement is pure ledger accounting (ADR-0020: two pools):
    ///
    /// 1. Determine coherence (Plurality: revealed vote == final ruling;
    ///    Median: within `coherence_tol_bps` of it — ADR-0025).
    /// 2. Slash each incoherent/non-revealing juror: `α · min_stake` →
    ///    `stake_delta` (stake_token).
    /// 3. Stake pool = slash_total → coherent `stake_delta` (stake_token).
    ///    When no juror is coherent but some revealed, pools go to revealers
    ///    instead (bean accord-aqmw). Zero reveals → surplus trapped.
    /// 4. Fee pool = non-revealer fees + forfeited (no-flip) bonds → coherent
    ///    `fees_earned` (fee_token). (Revealer base fees were credited at
    ///    `finalize_round`; only the forfeited portion redistributes here.)
    /// 5. Decrement `active_draws` for the final round's drawn jurors.
    /// 6. Write `final_ruling`, mark the round settled, transition to `Final`.
    ///
    /// `remaining_accounts` = [juror_stake PDAs (panel)] + [AppealBond PDAs
    /// (one per prior appeal)]. With no appeals this collapses to just juror
    /// stakes (backward-compatible single-round path).
    pub fn finalize_dispute(ctx: Context<FinalizeDispute>) -> Result<()> {
        FinalizeDispute::handler_finalize_dispute(ctx)
    }

    /// Permissionless crank: settles a **prior round's** coherence economics
    /// against the finalized ruling (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti).
    ///
    /// Prior-round jurors were left with `active_draws > 0` after the dispute
    /// finalized — this crank releases them. Each call handles one round (≤ 31
    /// Coherence is judged against `dispute.final_ruling`, not the round's own
    /// result: a round-0 juror who voted the option the final panel overturned
    /// is slashed; one who voted the final ruling gets a coherence share.
    /// When no juror is coherent (overturned prior round), pools fall back to
    /// revealers; zero reveals → surplus trapped (bean accord-aqmw).
    /// Revealer base fees were credited at `finalize_round`; non-revealer fees
    /// fold into the coherent fee pool (ADR-0020).
    pub fn settle_round(ctx: Context<SettleRound>, round_idx: u32) -> Result<()> {
        SettleRound::handler_settle_round(ctx, round_idx)
    }

    /// **Permissionless** appeal (ADR-0004): anyone may escalate a resolved
    /// round to a larger panel. The appellant deposits the new round's juror
    /// fee (`N_new · fee_per_juror`) plus an appeal bond (== the new round fee;
    /// forfeited to the final round's coherent jurors if the appeal fails to
    /// flip the prior ruling, returned if it flips). Opens a fresh round at
    /// `2N+1` by incrementing `current_round` and resetting the dispute to
    /// `Created` so the snapshot → draw → vote cycle reruns for the new panel.
    /// Custodies the bond in a per-appeal `AppealBond` PDA.
    ///
    /// `new_evidence_hash` optionally introduces fresh evidence for the new
    /// round (stored at `evidence_hashes[current_round + 1]`); `[0u8; 32]`
    /// sentinel = no new evidence, jurors reuse prior rounds' (milestone
    /// accord-qp7c).
    ///
    /// Gates: `RoundResolved` state, within the appeal window, under the
    /// `max_appeals` cap, and with enough active distinct stakers to fill the
    /// larger panel. Never pausable (ADR-0016) — pausing must not suppress the
    /// right to appeal.
    pub fn appeal(ctx: Context<Appeal>, new_evidence_hash: [u8; 32]) -> Result<()> {
        Appeal::handler_appeal(ctx, new_evidence_hash)
    }

    /// Permissionless crank that returns the appeal bond to its appellant once
    /// the dispute is terminal (Final or Failed). The appellant ALWAYS recovers
    /// only the bond — never the appeal fee (bean accord-xftx): on Final a
    /// flipped bond is returned (a no-flip bond was already zeroed by
    /// `finalize_dispute`); on Failed the bond is returned regardless (the
    /// appeal fee is owned by the round's jurors or trapped in the vault).
    /// `round_idx` selects which appeal's bond to claim (the round that was
    /// current when the appeal was filed). Verifies the `AppealBond` belongs to
    /// the destination ATA's owner, PDA-signs the vault → ATA refund, then
    /// zeroes the bond (idempotent).
    pub fn claim_appeal_refund(ctx: Context<ClaimAppealRefund>, round_idx: u32) -> Result<()> {
        ClaimAppealRefund::handler_claim_appeal_refund(ctx, round_idx)
    }
    /// dispute has stalled past its per-stage timeout, any cranker may cancel
    /// it: the filer's round-1 fee is refunded from the vault, the current
    /// round's drawn jurors have their `active_draws` released (post-draw
    /// stalls only), and the dispute transitions to the terminal `Failed`
    /// state.
    ///
    /// Two timeout windows (immutable program constants, so they are frozen
    /// for the dispute's life trivially — stronger than a `CaseTerms` field):
    /// - **Pre-draw** (`Created`): cancelable once
    ///   `now > filed_at + PRE_DRAW_CANCEL_TIMEOUT_SECS` — covers a VRF oracle
    ///   that never lands. If any seats already landed (`drawn_seats > 0`,
    ///   mirrored by `draw_seat`), the current `Round` + its drawn
    ///   `JurorStake` PDAs are REQUIRED up front (`[0]`, `[1..=seats]`) — a
    ///   cancel that omits them reverts rather than stranding the partial
    ///   jurors' `active_draws` forever (H-2, security review 2026-08-19).
    /// - **Post-draw** (`Drawn`/`Commit`/`Reveal`/`RoundResolved`): cancelable
    ///   once `now > round.reveal_end + terms.appeal_window +
    ///   POST_DRAW_CANCEL_GRACE_SECS` — covers a round no cranker ever
    ///   finalizes. The current `Round` is `remaining_accounts[0]`; the
    ///   drawn `JurorStake` PDAs follow (`[1..=panel]`).
    ///
    /// `Final`/`Closed`/`Failed` are terminal and revert. The filer refund is
    /// exactly `dispute.fee_paid` (C-1: the per-dispute fee pool — NOT the
    /// shared vault balance; the fee_vault is one ATA for the entire
    /// Subaccord). Appeal bonds stay claimable via `claim_appeal_refund`.
    pub fn cancel_dispute(ctx: Context<CancelDispute>) -> Result<()> {
        CancelDispute::handler_cancel_dispute(ctx)
    }

    /// Read-only: returns the dispute's `final_ruling`. The Arbitrable calls
    /// this via CPI to lazily read the outcome. Returns `None` until the
    /// dispute reaches `Final` (stored on-chain as the `u64::MAX` sentinel).
    /// The value is the winning option index for `Plurality` disputes or the
    /// final median for `Median` disputes (ADR-0025).
    pub fn get_ruling(ctx: Context<GetRuling>) -> Result<Option<u64>> {
        GetRuling::handler_get_ruling(ctx)
    }

    /// Withdraw aggregate earned fees (ADR-0020). Per-juror: pulls earned fees
    /// from the Subaccord's `fee_vault` → the juror's `fee_token` ATA. No
    /// `active_draws` gate, no timelock — earned fees are not at-risk capital.
    ///
    /// Bean accord-fdad: no vault-balance cap. The parallel-ledger invariant
    /// (`fee_vault.amount == fee_deposited − fee_withdrawn`, see Subaccord)
    /// guarantees the fee-side net always covers all unwithdrawn `fees_earned`
    /// — every fee credit was preceded by its backing deposit, and refunds
    /// only return unconsumed portions. The SPL transfer is the last-resort
    /// assertion: if it ever fails, it signals a missed accumulator touchpoint
    /// (a bug), not legitimate insolvency.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        WithdrawFees::handler_withdraw_fees(ctx)
    }

    /// Permissionless crank (ADR-0021): reconvenes a shortfall round. Callable
    /// only from `RedrawEligible`. `draw_attempt` is orthogonal to `round_idx` —
    /// bumping it changes only the sortition seed (fresh seats), never the panel
    /// size or the appeal budget.
    ///
    /// - **Redraw** (`draw_attempt + 1 < max_draw_attempts`): slashes no-shows
    ///   into `stake_delta` (pending, not `staked` — keeps the frozen-root
    ///   inflation guard passing), releases every drawn juror's `active_draws`
    ///   + `slash_reserve` for this failed round, bumps `round.draw_attempt`,
    ///   clears the round, and re-opens `Created` so `draw_seat` fills fresh
    ///   seats at the same panel size.
    /// - **Fail on exhaustion** (`draw_attempt + 1 >= max_draw_attempts`): same
    ///   slash/release for the current round (+ prior appeal rounds'
    ///   `active_draws` via `release_prior_rounds`), refunds the filer's
    ///   remaining `dispute.fee_paid` (per-dispute, vault-safe), and transitions
    ///   to terminal `Failed`. No-shows' accumulated slashes stand; outstanding
    ///   appeal bonds remain claimable via `claim_appeal_refund`.
    ///
    /// `remaining_accounts` = [current-round `JurorStake` PDAs (panel)]; on the
    /// Fail branch additionally [...prior `Round` PDAs + their `JurorStake`
    /// PDAs] + [...`AppealBond` PDAs] (same layout as `cancel_dispute`).
    pub fn redraw(ctx: Context<Redraw>) -> Result<()> {
        Redraw::handler_redraw(ctx)
    }
}
