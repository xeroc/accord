# @useaccord/ui

## 0.10.0

### Minor Changes

- [#45](https://github.com/xeroc/accord/pull/45) [`cefaa9c`](https://github.com/xeroc/accord/commit/cefaa9c1bb9bf7048776c1aa999b2619e4c2122d) Thanks [@xeroc](https://github.com/xeroc)! - UI kit: new frame-driven `CaseFiles` mechanism component (animated failure-case cards with `CASE_FILES` defaults), exported from @useaccord/ui; the landing hero renders it beside the H1 on the shared wall-clock frame.
  Landing refactor: belief-led hero hook ("Make honesty the equilibrium.") with boxed anonymized case files beside it, new integration-cost and narrow-scope blocks in the mechanism section, lineage entries linked to the source math (sortition, Condorcet, Nash, Schelling, Kleros), waitlist form and n8n webhook plumbing removed. Project references redacted to Kleros-only per marketing override.

### Patch Changes

- [#45](https://github.com/xeroc/accord/pull/45) [`f409ed6`](https://github.com/xeroc/accord/commit/f409ed643ff566a0186af1f6631a830c34f3b524) Thanks [@xeroc](https://github.com/xeroc)! - Landing: new "Machine jurors, on duty" section presenting Jurat, the
  open-source AI juror operator, between Heritage and Audience. Four
  capability cards (reads every page / minutes not weeks / abstains never
  guesses / open source, dry-run by default), a four-beat duty progress
  strip (READ → ADJUDICATE → COMMIT → REVEAL — each box fills to amber
  over 3s, reduced motion settles all four), and a full-width operator
  band with kit Button CTAs to the repo and ADR-0036.
  Copy law: defensible capability claims only, no traction claims.

  UI kit: vendored the free-tier reui components `icon-tile` and `frame`
  (radix-nova registry variant, installed via `shadcn add @reui/...` into
  `src/components/reui/`, imports repointed to the kit's own `cn` util —
  no new dependencies). Retheming is zero-CSS: the components read the
  shadcn semantic tokens that theme.css already maps onto the accord
  palette. Stories included (ReUI/Icon Tile, ReUI/Frame).

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.5

No changes in this release.

## 0.8.4

No changes in this release.

## 0.8.3

No changes in this release.

## 0.8.2

### Patch Changes

- [#33](https://github.com/xeroc/accord/pull/33) [`272e9ca`](https://github.com/xeroc/accord/commit/272e9caa429c80ffb3cc4d994f4c37209ec25141) Thanks [@xeroc](https://github.com/xeroc)! - jurat: file-backed delivery-key storage no longer eats a key byte when the 64-byte keypair's last byte is `\r` followed by editor `\n` contamination (read as a `\r\n` pair, trimmed to 63 bytes, then rejected) — the trim now stops at 64 bytes. ui: storybook vitest project `testTimeout` raised to 60s; the default 15s starved long stories under full-suite browser parallelism.

## 0.8.1

No changes in this release.

## 0.8.0

### Patch Changes

- [#27](https://github.com/xeroc/accord/pull/27) [`e6eaa63`](https://github.com/xeroc/accord/commit/e6eaa632eb273735d12b0896963a62550ac98872) Thanks [@xeroc](https://github.com/xeroc)! - cancel_dispute remainingAccounts: single-source derivation + AppealBond seed fixes (bean accord-br6a)

  - SDK: new `deriveCancelDisputeRemainingAccounts` mirrors the on-chain strict
    accounting (current Round + panel only when seats were drawn, prior rounds +
    panels, AppealBond seeds 0..currentRound-1; EMPTY for a never-drawn stall).
  - Cranker `cancel_dispute` no longer pushes the current-round PDA
    unconditionally — that made every pre-draw cancel (dead VRF oracle) revert
    with `InvalidPanelSize` (cancel_dispute.rs:261) — and now carries prior
    rounds it previously omitted entirely.
  - Cranker `finalize_dispute` + reconciler `claim_refund` sweep: AppealBond
    seeds were off by one (1..currentRound); the first appellant's bond (seed 0)
    was never swept and appealed finalizes reverted.
  - CLI `dispute:cancel --remaining-accounts auto` now uses the SDK derivation
    (old auto interleaved rounds/bonds in the wrong order, deduped repeat
    jurors, and pushed stake PDAs for unfilled seat sentinels).

- [#27](https://github.com/xeroc/accord/pull/27) [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302) Thanks [@xeroc](https://github.com/xeroc)! - Re-anchor round windows at the last state change (ADR-0038, bean accord-9952)

  - `commit` (panel-full) re-anchors `Round.reveal_end` shrink-only to
    `now + reveal_window` — revealers get the full reveal window from the LAST
    commitment, not from the scheduled `commit_end`.
  - `finalize_round` (early resolve, all revealed) pins `reveal_end = now` —
    the appeal window opens at resolution. The timeout path never extends it.
  - Every deadline consumer (`appeal`, `finalize_dispute`, `cancel_dispute`)
    anchors at the re-anchored `reveal_end`, so an eager panel reaches `Final`
    at `resolve_ts + appeal_window` instead of idling out the scheduled
    commit+reveal span (devnet repro: Inveigo arena court, 1s/12h/12h/30s,
    ~24h → ~40s). No account-layout, IDL, or SDK-signature change.
  - e2e harness: new shared `warpToRevealWindow` (draw-harness + appeal.spec
    local) replaces the `warpTo(commitEnd)` reveal warps; jurat duty tracker
    header documents the live-field requirement + a phase test pins it.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.2

No changes in this release.

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number

## 0.3.0

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- intial changeset release
