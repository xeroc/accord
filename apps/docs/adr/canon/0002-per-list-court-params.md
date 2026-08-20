# Per-list court parameters at `create_list`

[canon/0001](0001-canon-curated-list-arbitrable-over-accord.md) pinned Canon's
dispute-mechanism profile: `create_list` forwarded hardcoded canonical defaults
(min stake, alpha, windows, appeals, fees, depth) to the backing Subaccord's
`create_subaccord` CPI, and the creator owned only the registry economics
(`submit_deposit`, `challenge_pct`, `listing_window`, `withdrawal_timelock`) and
token choice. This ADR **partially supersedes** that decision (canon/0001 §
"Dispute-parameter ownership"): the list creator now supplies the court profile
at `create_list` as a grouped `court: CourtParams` argument, with Canon pinning
the protocol-identity fields and guarding the few invariants Accord's CPI does
not check.

Why the reversal: 0001's stated risk was "a permissionless creator can
mis-parameterize a court into capturability". But capture resistance lives in
Accord's VRF-distinct-draw-with-caps and in the fields Canon keeps pinned — not
in window lengths or fee levels, which are risk-profile taste. A high-stakes
authenticity list wants a bigger round-1 panel and longer deliberation windows;
a micro-registry wants hours. Forcing one canonical profile on every list made
Canon a worse client of Accord's own per-Subaccord configurability
(ADR-0019/0021/0022 all made these fields per-Subaccord for exactly this
reason).

## Decision

1. **New grouped arg `CourtParams`** in `programs/canon/src/state.rs` (same
   grouped-args pattern as Accord's `CreateSubaccordParams`), threaded through
   `create_list`:

   ```rust
   pub struct CourtParams {
       pub min_stake: u64,              // canonical default 1_000
       pub alpha_bps: u16,              // canonical default 1_000
       pub review_window: u64,          // canonical default 7d
       pub commit_window: u64,          // canonical default 2d
       pub reveal_window: u64,          // canonical default 2d
       pub appeal_window: u64,          // canonical default 3d
       pub max_appeals: u8,             // canonical default 3
       pub min_jury_size: u32,          // canonical default 3   (set-once)
       pub fee_per_juror: u64,          // canonical default 10
       pub reveal_threshold_bps: u16,   // canonical default 6_666
       pub max_draw_attempts: u8,       // canonical default 3
       pub depth: u8,                   // canonical default 8   (set-once)
   }
   ```

   Signature: `create_list(list_program, rules_hash, submit_deposit,
   challenge_pct, listing_window, withdrawal_timelock, evidence_operator,
   court: CourtParams)`. `evidence_operator` stays its own arg — it is a
   deployment-supplied key (dApp: `VITE_EVIDENCE_OPERATOR_ADDRESS`), not a court
   parameter.

2. **Pinned in the handler, never creator-settable:** the handler maps
   `CourtParams` → `accord::state::CreateSubaccordParams` with
   `aggregation = Plurality` (Canon disputes are binary `[keep, remove]`; a
   Median scalar is meaningless), `shortfall_policy = Redraw` (the only
   variant), `coherence_tol_bps = 0` (inert under Plurality, ADR-0025),
   `authority = CanonList PDA` (the retuning upgrade path — creator-settable
   authority would burn it), and `juror_credential`/`juror_schema` = `default()`
   (attestation gating is separate scope, PROG-ATTESTTION). Seeds and
   `OPTION_KEEP`/`OPTION_REMOVE` are protocol identity, not parameters.

3. **Canon-side guards — only what Accord's `create_subaccord` CPI does not
   already validate** (CPI errors propagate; nothing is duplicated):
   - `alpha_bps <= 10_000` → `AlphaTooHigh`. Accord's `create_subaccord` has no
     alpha check (a separate Accord-side bean tracks adding one); without a
     canon guard a creator could slash 100% of juror stake.
   - `review_window > 0 && commit_window > 0 && reveal_window > 0` →
     `WindowTooShort`. Zero windows brick disputes forever, stranding
     third-party item deposits — not just creator self-harm. The appeal window
     floor is already enforced by Accord (ADR-0022).
   - `depth <= MAX_LIST_TREE_DEPTH = 8` (new canon constant) →
     `TreeDepthTooDeep`. Accord allows depth up to 31, but every `stake`/`draw`
     tx carries a depth-length MST path (~40 B/level, ADR-0012): the depth-8
     stake tx is ~900 B and the 1232-byte tx limit is close. Raising the
     ceiling needs a measured draw-tx budget first (follow-up bean).

   Everything else — `max_appeals <= MAX_APPEALS`, odd `min_jury_size`, ladder
   `<= MAX_JURORS`, `reveal_threshold_bps <= 10_000`, `max_draw_attempts` in
   `1..=MAX_DRAW_ATTEMPTS`, `depth <= 31`, `appeal_window >=
   MIN_APPEAL_WINDOW_SECS` — is Accord's validation at the CPI boundary.

4. **The canonical default profile moves to the SDK.** The court `DEFAULT_*`
   constants and the dead `INITIAL_NUM_JURORS` restatement are deleted from
   `programs/canon/src/constants.rs` (canon keeps `SEED_*`, `OPTION_*`,
   `MAX_CHALLENGE_PCT_BPS`, and gains `MAX_LIST_TREE_DEPTH`). The canonical
   profile lives on as `defaultCourtParams()` exported from `@useaccord/canon`
   (mirroring `defaultSubaccordArgs` in the e2e fixtures): the dApp and tests
   call the helper; power users spread-and-override. Defaults are caller
   convenience, not program state — they belong where the call is made.

5. **Immutability:** `min_jury_size` and `depth` are **set-once** — immutable on
   the Subaccord (absent from `UpdatePayload`), so they are irreversible list
   creation choices. All other court params remain retunable later via the
   future PDA-authority `propose_subaccord_update` CPI path (48h timelock,
   ADR-0005; the CanonList PDA is the authority, see canon/0001).

## Considered Options

**How the creator sets the court profile.**

- Keep canon/0001's canonical defaults (rejected — one profile cannot fit
  high-stakes and micro registries; wastes Accord's per-Subaccord
  configurability).
- Expose all of `CreateSubaccordParams` (rejected — `authority`,
  `aggregation`, `shortfall_policy`, `coherence_tol_bps`, and the attestation
  pair are protocol identity, not taste; a creator-settable `authority` would
  burn the retuning upgrade path).
- **Grouped `CourtParams` with protocol fields pinned in the handler
  (chosen).** Creator gets every risk-profile knob; Canon keeps every identity
  knob; the mapping lives in one place.

**Where the canonical defaults live.**

- Program constants (rejected — per-list values are the caller's choice;
  program constants would just be forwarded boilerplate again).
- **SDK `defaultCourtParams()` (chosen).** Same default UX
  (`defaultCourtParams()` ≙ the old canonical profile), zero program surface.

**Validation split.**

- Re-validate the full `CreateSubaccordParams` contract in canon (rejected —
  duplicated validation drifts from Accord's).
- **Guard only the un-checked invariants; let CPI errors propagate
  (chosen).** Canon adds exactly three errors (`AlphaTooHigh`,
  `WindowTooShort`, `TreeDepthTooDeep`) covering the gaps that strand
  third-party value.

## Consequences

- `create_list` gains the `court` arg; the signature change ripples through
  codegen, the `@useaccord/canon` facade (`CreateListArgs.court` +
  `defaultCourtParams()`), the e2e specs, and the dApp create flow (change
  coupling, AGENTS.md §Change Coupling).
- `CanonList` account layout is **unchanged** — court params live on the
  backing Subaccord; no resize, no migration.
- A creator can still mis-parameterize within the guarded envelope (e.g. a
  1-jury court with `min_jury_size = 1` is allowed, matching Accord's
  attestation-gated single-juror use case); list users must read the
  Subaccord, not assume the canonical profile.
- Zero-window courts are now impossible at the canon boundary; alpha > 100%
  slashing and depth > 8 are rejected before the CPI.
- canon/0001's §"Dispute-parameter ownership" and the SPEC §v1 canonical
  defaults are superseded as described here; 0001 itself is immutable once
  deployed and is superseded by reference only.

## Authority

`programs/canon/SPEC.md` (§Court profile, §Instructions #1) ·
[canon/0001](0001-canon-curated-list-arbitrable-over-accord.md) (superseded in
part) · Accord [ADR-0005](../accord/0005-subaccord-authority-pubkey-timelock.md)
· [ADR-0012](../accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)
· [ADR-0019](../accord/0019-subaccord-dispute-kit-aggregation-enum-fixed-panel-ladder.md)
· [ADR-0021](../accord/0021-reveal-quorum-shortfall-redraw-draw-attempt.md) ·
[ADR-0022](../accord/0022-per-subaccord-configurable-appeal-window.md) ·
[ADR-0025](../accord/0025-scalar-voting.md).
