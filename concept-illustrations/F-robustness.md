# Group F — Robustness and failure modes

Illustration targets for the Accord docs site. Each concept gets one individual, self-contained looping motion illustration (~3–8s) that makes the concept click without narration.

**What Accord is:** a Schelling-point arbitration primitive on Solana. Any program (an *Arbitrable*) files a Dispute via CPI; Accord draws stake-weighted Jurors from a live Merkle-Sum-Tree accumulator using VRF randomness, collects commit-reveal votes, and emits a Ruling. Coherent Jurors earn fees plus slashed stake; incoherent Jurors are slashed. Appeals double the panel (3→7→15→31) at exponentially rising bond cost.

---

## F1. The `(round_idx, draw_attempt)` grid

The two orthogonal counters are the most conflated pair in the protocol: `round_idx` = appeal axis (panel grows, consumes appeal budget, costs a bond), `draw_attempt` = redraw axis (same panel size, slashes no-shows, triggered by reveal-quorum shortfall **or** a plurality tie). Illustrate as a 2D grid with panel-size dots growing along one axis and staying constant along the other, a sample dispute path snaking through it, and the two exhaustion terminals marked (appeals exhausted → ruling stands; attempts exhausted → `Failed` + refund).

## F2. The liveness escape hatch (`Failed` + `cancel_dispute`)

Every stall class — silent VRF oracle, ghosting jurors, absent cranker — has a known, permissionless, timeout-gated exit; nothing locks forever. Illustrate as the lifecycle diagram with dead-end scenarios drawn as cul-de-sacs, each with a countdown clock and an exit arrow to `Failed` + filer refund. Caption: "the worst an attacker or a dead dependency can do is force a refund, not capture a ruling."

## F3. Pause scope split (an operational switch can never pick winners)

Pause gates only `create_dispute` and `stake`; every adjudicating instruction — `appeal`, `commit`, `reveal`, `finalize`, `unstake` — is structurally un-gateable. Illustrate as a factory valve closing exactly the two intake pipes while the whole adjudication pipeline runs ungated behind them; the rejected attack (pause during the appeal window to smother appeals and force finality) shown crossed out.

## F4. The attestation gate + `prune_juror`

A Subaccord may bind `(juror_credential, juror_schema)` immutably; SAS attestations are checked at `stake` (expiry must outlive the worst-case dispute horizon) and re-checked at `draw_seat`; expired jurors are evicted by a permissionless prune that mirrors `request_withdraw`. Illustrate as a pool turnstile with three defense layers on a timeline — entry gate, draw-time freshness stamp, eviction crank — and the evicted juror's leaf visibly zeroed in the tree, funds flowing to `pending_withdrawal`.

## F5. Scalar voting (median + coherence band)

`Median` disputes file with zero options, jurors reveal u64 fixed-point values, the tally is the median, and coherence is a bps band: `|vote − final_ruling|·10⁴ ≤ final_ruling·tol_bps`, default ±1%. Illustrate as a number line with revealed votes as dots, the median flagged, the tolerance band shaded — dots inside paid, outliers outside slashed — side-by-side with the plurality exact-match bar chart. One panel each makes the Plurality/Median contrast visual.

## F6. CaseTerms freeze (config snapshot at filing)

All mechanism parameters — windows, `aggregation`, `appeal_window`, `reveal_threshold_bps`, `coherence_tol_bps`, the ladder — are frozen onto the Dispute at `create_dispute`; the 48h authority timelock governs only future filings; the identity set is immutable outright. Illustrate as a Subaccord control panel whose dials get photographed and stapled onto the dispute at filing, with later timelocked dial-turns affecting only a queue of future filings, and a welded sub-panel for the immutable fields. Kills the recurring "can governance change my dispute mid-flight" question.

## F7. Trust profile map

The honest positioning made visual: what is trustless by construction (accumulator root, sortition verification, fee accounting) vs what carries explicit residual assumptions (honest stake majority, VRF provider liveness, evidence operator plaintext access, credential authority judgment, multisig upgrade authority pre-freeze). Illustrate as the system map re-rendered with color-coded trust boundaries — green (verified on-chain), amber (trusted but attributed/mitigated), red (honest-majority assumption). For an arbitration product, trust topology *is* a feature diagram.
