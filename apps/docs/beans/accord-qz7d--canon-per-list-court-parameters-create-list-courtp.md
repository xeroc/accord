---
# accord-qz7d
title: Canon — per-list court parameters (create_list CourtParams)
status: todo
type: milestone
priority: high
created_at: 2026-08-19T18:18:13Z
updated_at: 2026-08-19T18:18:14Z
---

## Scope

Make the court (dispute-mechanism) profile of a Canon list's backing Subaccord creator-configurable at `create_list`, replacing the hardcoded canonical defaults forwarded from `programs/canon/src/constants.rs`. Worktree: `feat-custom-list-parameters`.

List-level economics (`submit_deposit`, `challenge_pct`, `listing_window`, `withdrawal_timelock`) are ALREADY per-list args stored on `CanonList` — unchanged by this milestone.

## Design (grilled 2026-08-19)

New grouped arg `CourtParams` in `programs/canon/src/state.rs` (same grouped-args pattern as Accord's `CreateSubaccordParams`, bean accord-sqve), forwarded to the `create_subaccord` CPI with Canon-fixed fields pinned:

```rust
pub struct CourtParams {
    pub min_stake: u64,              // canonical default 1_000
    pub alpha_bps: u16,              // canonical default 1_000
    pub review_window: u64,          // canonical default 7d
    pub commit_window: u64,          // canonical default 2d
    pub reveal_window: u64,          // canonical default 2d
    pub appeal_window: u64,          // canonical default 3d
    pub max_appeals: u8,             // canonical default 3
    pub min_jury_size: u32,          // canonical default 3  (immutable on Subaccord)
    pub fee_per_juror: u64,          // canonical default 10
    pub reveal_threshold_bps: u16,   // canonical default 6_666
    pub max_draw_attempts: u8,       // canonical default 3
    pub depth: u8,                   // canonical default 8  (immutable on Subaccord)
}
```

Signature: `create_list(list_program, rules_hash, submit_deposit, challenge_pct, listing_window, withdrawal_timelock, evidence_operator, court: CourtParams)` — `evidence_operator` stays its own arg (decision #3).

### Pinned (NOT exposed) and why

- `aggregation = Plurality` — Canon disputes are binary (keep/remove); Median scalars meaningless (decision #1)
- `shortfall_policy = Redraw` — only variant that exists (`programs/accord/src/state.rs` ShortfallPolicy)
- `coherence_tol_bps = 0` — inert under Plurality (ADR-0025)
- `authority = CanonList PDA` — the retuning upgrade path (bean accord-5so4); must never be creator-settable
- `juror_credential` / `juror_schema = Pubkey::default()` — PROG-ATTOTTION is separate scope
- seeds + `OPTION_KEEP`/`OPTION_REMOVE` — protocol identity

### Canon-side guards (ONLY what Accord doesn't enforce at the CPI boundary)

- `alpha_bps <= 10_000` → new error `AlphaTooHigh`. Accord's `create_subaccord` has NO alpha check (verified in handler) — separate Accord bug bean filed.
- `review_window > 0 && commit_window > 0 && reveal_window > 0` → new error `WindowTooShort`. Zero windows brick disputes forever → third-party item deposits stuck (not just creator self-harm). Appeal floor already enforced by Accord.
- `depth <= MAX_LIST_TREE_DEPTH = 8` (new constant) → new error `TreeDepthTooDeep`. Tx-size evidence in canon `constants.rs`: depth-8 stake tx ≈ 900 B, +40 B/level of MST path. Raising the ceiling needs a measured draw-tx budget first (follow-up).

Accord CPI already validates (do NOT duplicate): `max_appeals <= MAX_APPEALS`, odd `min_jury_size`, ladder `<= MAX_JURORS`, `reveal_threshold_bps <= 10_000`, `max_draw_attempts in 1..=MAX_DRAW_ATTEMPTS`, `depth <= 31`, `appeal_window >= MIN_APPEAL_WINDOW_SECS`.

### Constants aftermath

Delete from `programs/canon/src/constants.rs`: `DEFAULT_MIN_STAKE`, `DEFAULT_ALPHA_BPS`, `DEFAULT_REVIEW_WINDOW_SECS`, `DEFAULT_COMMIT_WINDOW_SECS`, `DEFAULT_REVEAL_WINDOW_SECS`, `DEFAULT_APPEAL_WINDOW_SECS`, `DEFAULT_MAX_APPEALS`, `DEFAULT_FEE_PER_JUROR`, `DEFAULT_REVEAL_THRESHOLD_BPS`, `DEFAULT_MAX_DRAW_ATTEMPTS`, `DEFAULT_TREE_DEPTH`, and the DEAD `INITIAL_NUM_JURORS` (handler already uses `accord::constants::INITIAL_NUM_JURORS`; its doc-comment claiming "not a Subaccord parameter" is stale — Accord made it one in accord-9q3e). Keep: `SEED_*`, `OPTION_*`, `MAX_CHALLENGE_PCT_BPS`. Add: `MAX_LIST_TREE_DEPTH = 8`.

Canonical default profile moves to the SDK: `defaultCourtParams()` export in `@useaccord/canon` (mirrors `defaultSubaccordArgs` in `tests/src/setup/fixtures.ts`). dApp + tests call the helper; power users spread-and-override.

### Immutability notes

`min_jury_size` and `depth` are immutable on the Subaccord (absent from `UpdatePayload`) — set-once at list creation. All other court params are retunable later via the future PDA-authority `propose_subaccord_update` CPI path. `CanonList` account layout is UNCHANGED (court params live on the Subaccord) — no account resize, no migration.

## Decisions

1. Pin `aggregation = Plurality` (binary ruling; Median meaningless) — user, 2026-08-19
2. `depth` ceiling = 8 (measured tx-size evidence; raising gated on draw-tx measurement follow-up) — user, 2026-08-19
3. `evidence_operator` stays its own `create_list` arg (no churn on the shipped accord-mpff surface) — user, 2026-08-19

## HANDOFF

### 1. Happy Path

1. Caller builds `CourtParams` (or `defaultCourtParams()` from `@useaccord/canon`) and calls `create_list(list_program, rules_hash, submit_deposit, challenge_pct, listing_window, withdrawal_timelock, evidence_operator, court)` via the SDK facade.
2. Canon handler validates canon-side guards (alpha ≤ 10_000, nonzero review/commit/reveal windows, depth ≤ 8).
3. Handler maps `CourtParams` → `accord::state::CreateSubaccordParams`, pinning `aggregation=Plurality`, `shortfall_policy=Redraw`, `coherence_tol_bps=0`, `authority=list_pda`, `juror_credential/schema=default()`, `evidence_operator` from the separate arg.
4. CPI `create_subaccord` runs Accord's own validation; every field of `CourtParams` lands verbatim on the backing Subaccord.
5. `CanonList` init unchanged; dispute-mechanism economics are read from the Subaccord thereafter.

### 2. Data Contract

- Public surface: `CourtParams` struct (12 fields, exact names above) in `programs/canon/src/state.rs`; `create_list` signature above; SDK `CreateListArgs.court: CourtParams` + `defaultCourtParams(): CourtParams` in `@useaccord/canon`; new errors `AlphaTooHigh`, `WindowTooShort`, `TreeDepthTooDeep` in `programs/canon/src/errors.rs`; new constant `MAX_LIST_TREE_DEPTH: u8 = 8`.
- Modules touched: `programs/canon/src/{state.rs,lib.rs,errors.rs,constants.rs}`, `programs/canon/src/instructions/create_list.rs`, `packages/canon/src/{methods.ts,index.ts,generated/**}`, `packages/canon/README.md`, `tests/src/{canon.challenge.spec.ts,setup/draw-harness.ts}`, `apps/canon/src/features/list/CreateListPage.tsx`, `programs/canon/SPEC.md`, `apps/docs/adr/canon/0002-*` + `index.md`.
- No new accounts; no `CanonList` field changes.

### 3. Edge Cases & Constraints

- NEVER let the caller set `authority`, `aggregation`, `shortfall_policy`, `coherence_tol_bps`, or the attestation pair — they are pinned in the handler, not filtered from input.
- Do NOT re-validate what Accord's `create_subaccord` already rejects (appeals cap, jury parity, ladder fit, thresholds, draw attempts, appeal-window floor) — CPI errors propagate.
- `min_jury_size` and `depth` are set-once (immutable on Subaccord, absent from `UpdatePayload`) — document as irreversible in SPEC/ADR.
- Never hand-edit `packages/canon/src/generated/` — `make codegen` only.
- All `anchor build` invocations pass `--ignore-keys` (canonical-keypair guard).

### 4. Business Logic (pseudo-code)

```
fn create_list_handler(..., court: CourtParams):
    require(rules_hash != [0;32])
    require(evidence_operator != default)
    require(challenge_pct <= MAX_CHALLENGE_PCT_BPS)
    require(court.alpha_bps <= 10_000)              // AlphaTooHigh
    require(court.review_window > 0
         && court.commit_window > 0
         && court.reveal_window > 0)                 // WindowTooShort
    require(court.depth <= MAX_LIST_TREE_DEPTH)      // TreeDepthTooDeep
    cpi create_subaccord(rules_hash, [0;32], CreateSubaccordParams {
        ...court,
        aggregation: Plurality, shortfall_policy: Redraw, coherence_tol_bps: 0,
        authority: list_pda, evidence_operator,
        juror_credential: default, juror_schema: default,
    })
    init CanonList (unchanged fields)
```

### 5. Definition of Done

- [ ] LiteSVM RED→GREEN: custom profile lands verbatim on the Subaccord; `AlphaTooHigh` / `WindowTooShort` / `TreeDepthTooDeep` revert; Accord CPI rejections (even jury, ladder overflow) propagate through canon
- [ ] `make codegen` + `@useaccord/canon` facade (`court` arg + `defaultCourtParams()`) + README args updated
- [ ] `tests/src/canon.challenge.spec.ts` green on Surfpool passing an explicit court profile; stale "depth 20" comments fixed (`canon.challenge.spec.ts:77`, `setup/draw-harness.ts:287`)
- [ ] `apps/canon` CreateListPage passes `defaultCourtParams()`
- [ ] canon SPEC instruction table + new ADR `canon/0002` + adr index updated
- [ ] `make lint` green, `pnpm -r run build` green workspace-wide
- [ ] Dead constants removed from `programs/canon/src/constants.rs`; `grep -rn "DEFAULT_TREE_DEPTH\|INITIAL_NUM_JURORS" programs/canon` clean

### 6. Test Matrix (Given / When / Then)

- Given a fresh list, When `create_list` with custom `CourtParams`, Then every field lands verbatim on the backing Subaccord (fetch + compare)
- Given `alpha_bps = 10_001`, When `create_list`, Then tx fails `AlphaTooHigh`
- Given any of review/commit/reveal window = 0, When `create_list`, Then tx fails `WindowTooShort`
- Given `depth = 9`, When `create_list`, Then tx fails `TreeDepthTooDeep`
- Given `min_jury_size = 4` (even), When `create_list`, Then tx fails with Accord's `EvenJurySize` (propagated)
- Given `min_jury_size = 3, max_appeals = 3` ladder ok, When create + stake + challenge, Then dispute path works end-to-end with custom windows (e2e, warp-split cheats)

### 7. Open Questions

- Tighter window floors than nonzero (e.g. 1h) — deferred; nonzero is the actual anti-brick invariant.
- Raising `MAX_LIST_TREE_DEPTH` beyond 8 — blocked on measuring the draw tx at depth > 8 (follow-up bean).
- Advanced court-params UI in `apps/canon` — product decision, out of scope here.
