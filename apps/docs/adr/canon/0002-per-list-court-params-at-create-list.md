# Per-list court parameters at `create_list`

ADR canon/0001 chose **Canon-enforced canonical dispute-mechanism defaults**
for every list's backing Subaccord: a permissionless creator "can
mis-parameterize a court into capturability". This ADR supersedes that one
decision (Canon 0001 otherwise stands): the court profile is now
**creator-supplied at `create_list`** as a grouped `CourtParams` argument,
behind canon-side guards and with the capture-critical fields pinned by the
handler.

List-level economics (`submit_deposit`, `challenge_pct`, `listing_window`,
`withdrawal_timelock`) were already per-list args stored on `CanonList` —
unchanged here.

## Considered Options

**Who owns the court profile.**

+ **Canon enforces one canonical profile** (canon/0001 choice). Rejected —
  one profile cannot fit every registry: a high-stakes token-authenticity list
  wants deep appeal ladders and long windows; a low-stakes social list wants
  cheap fast rounds. Forcing the canonical profile means every niche list
  overpays or under-protects.
+ **Creator sets everything, Accord validates at the CPI.** Rejected — Accord's
  `create_subaccord` does not check `alpha_bps` at all (separate bug bean), and
  zero review/commit/reveal windows would brick disputes forever, stranding
  **third-party** item deposits (not just creator self-harm).
+ **Creator sets `CourtParams` behind canon guards + handler-pinned fields
  (chosen).** The creator owns every tunable; canon owns the invariant surface.

**What stays pinned (never creator-settable).**

+ `aggregation = Plurality` — Canon disputes are binary (`[keep, remove]`); a
  Median scalar over two options is meaningless.
+ `shortfall_policy = Redraw` — the only variant that exists.
+ `coherence_tol_bps = 0` — inert under Plurality (ADR-0025); zero keeps it
  exact.
+ `authority = the CanonList PDA` — the retuning upgrade path; a creator-set
  authority would burn it forever (the field is immutable on the Subaccord).
+ `juror_credential` / `juror_schema = Pubkey::default()` — attestation gating
  (PROG-ATTESTTION) is separate scope.
+ seeds, `domain_ref` (= `rules_hash`), `OPTION_KEEP`/`OPTION_REMOVE` —
  protocol identity.

**Canon-side guards — only what Accord's CPI does not already enforce.**

+ `alpha_bps <= 10_000` → `AlphaTooHigh` (Accord has no alpha check).
+ `review_window > 0 && commit_window > 0 && reveal_window > 0` →
  `WindowTooShort` (anti-brick; the appeal-window floor is already Accord's).
+ `depth <= MAX_LIST_TREE_DEPTH = 8` → `TreeDepthTooDeep`. Each `stake`/`draw`
  tx carries a depth-length `MSTNode` path (~40 B/level); past depth 8 the draw
  tx blows the 1232-byte packet budget. Tighter than Accord's `depth <= 31` on
  purpose; raising the ceiling needs a measured draw-tx budget first
  (follow-up bean).

Everything else — appeals cap, jury parity, ladder fit, reveal threshold,
draw-attempt bounds, appeal-window floor — is validated by Accord's
`create_subaccord` and its CPI errors propagate through canon unchanged.

## Consequences

+ **`CourtParams`** (12 creator-settable fields: `min_stake`, `alpha_bps`,
  the four windows, `max_appeals`, `min_jury_size`, `fee_per_juror`,
  `reveal_threshold_bps`, `max_draw_attempts`, `depth`) rides as the trailing
  grouped arg of `create_list`; `evidence_operator` stays its own arg. Every
  field lands verbatim on the backing Subaccord.
+ **The canonical default profile moves to the SDK**:
  `defaultCourtParams()` in `@useaccord/canon` (dApp + tests call it; power
  users spread-and-override). The dead `DEFAULT_*` court constants and
  `INITIAL_NUM_JURORS` are deleted from `programs/canon/src/constants.rs`;
  `MAX_LIST_TREE_DEPTH` is added.
+ **`min_jury_size` and `depth` are set-once** — immutable on the Subaccord
  (absent from Accord's `UpdatePayload`), so list creation is the only write
  path. All other court params are retunable later via the future
  PDA-authority `propose_subaccord_update` CPI path.
+ **`CanonList` layout is unchanged** — court params live on the Subaccord; no
  account resize, no migration.
+ **Capture resistance** still inherits from Accord's draw caps plus the
  handler pins; a creator can tune economics but cannot weaken the mechanism
  itself (aggregation, authority, options, credentials are not theirs to set).
+ The capturability concern that drove canon/0001's original choice is
  addressed by the guard set, not by freezing the profile: the residual risks
  (a creator picking a tiny jury + zero appeals) are economic self-harm
  confined to their own list, and the anti-brick windows protect third parties.

## Authority

`programs/canon/src/state.rs` (`CourtParams`) ·
`programs/canon/src/instructions/create_list.rs` (guards + pinned mapping) ·
`programs/canon/SPEC.md` §Instructions #1 + §Court profile ·
ADR accord/0005 (Subaccord immutability/timelock), accord/0019 (panel size),
accord/0021 (reveal quorum), accord/0025 (aggregation) ·
ADR canon/0001 (superseded decision: dispute-parameter ownership).
