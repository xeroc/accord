# @useaccord/landing

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

- Updated dependencies [[`e6eaa63`](https://github.com/xeroc/accord/commit/e6eaa632eb273735d12b0896963a62550ac98872), [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302)]:
  - @useaccord/ui@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.7.0

## 0.6.0

### Patch Changes

- [#22](https://github.com/xeroc/accord/pull/22) [`cf7fad5`](https://github.com/xeroc/accord/commit/cf7fad59a1b55c5835639cbd663d1bb92c4e5404) Thanks [@xeroc](https://github.com/xeroc)! - Add a whitepaper card to the how-it-rules hub: full-width card linking to /whitepaper.pdf (first-page shot left, headline + abstract excerpt right, entire card clickable), with the film chapters moved under an "Explainers" subsection heading.
- Updated dependencies []:
  - @useaccord/ui@0.6.0

## 0.5.2

### Patch Changes

- [#18](https://github.com/xeroc/accord/pull/18) [`85be9db`](https://github.com/xeroc/accord/commit/85be9dbe22d3ed0427df2549eb21f754a01c2a43) Thanks [@xeroc](https://github.com/xeroc)! - Landing copy rewrite: removed the repeated generated-text patterns ("X — not Y" parallelism, "No X, no Y, no Z" stacks, orphan aphorisms) and fixed trust overclaims ("trustless" → "trust-minimized", "capture is structurally impossible" softened). Blurb-page and How-it-Rules copy aligned.

- [#18](https://github.com/xeroc/accord/pull/18) [`94db86a`](https://github.com/xeroc/accord/commit/94db86ad4775dfe3afd0eed49c2a699eb1e7c9df) Thanks [@xeroc](https://github.com/xeroc)! - Wire Plausible analytics (self-hosted at p.chainsquad.com, defer-loaded, domain-scoped) to the app and landing pages.
- Updated dependencies []:
  - @useaccord/ui@0.5.2

## 0.5.1

### Patch Changes

- [#16](https://github.com/xeroc/accord/pull/16) [`a45d64e`](https://github.com/xeroc/accord/commit/a45d64ed73dbeeac26e6e9989d31244d043f0075) Thanks [@xeroc](https://github.com/xeroc)! - Landing + blurb: launch the copy — Accord is live on mainnet (unaudited). Adds the mainnet launch thread to the blurb explainers; replaces every pre-launch / "v1 is the build target" claim across Nav, Audience, Heritage, Footer, the waitlist, and the blurb status line. No traction claims added.
- Updated dependencies []:
  - @useaccord/ui@0.5.1

## 0.5.0

### Minor Changes

- [#14](https://github.com/xeroc/accord/pull/14) [`958eb11`](https://github.com/xeroc/accord/commit/958eb113cdb40ef26ed07573c05a8cbb0b3b0cdd) Thanks [@xeroc](https://github.com/xeroc)! - add the unlisted /blurb route — copyable words (one-liner, short + standard blurb), a forwardable intro email, the founder's Accord explainer tweets with videos, team + track record, brand kit (mark SVGs, palette, type), and contact. Ported from the riprap blurb page structure, restyled onto the Accord tokens.

- [#14](https://github.com/xeroc/accord/pull/14) [`958eb11`](https://github.com/xeroc/accord/commit/958eb113cdb40ef26ed07573c05a8cbb0b3b0cdd) Thanks [@xeroc](https://github.com/xeroc)! - refactor the landing router to react-router HashRouter (the workspace convention for GH Pages): hash routes (#/, #/how-it-rules/:slug, #/blurb), Link-based internal nav, scroll-to-top and per-route document titles, unknown routes fall back home; legacy path URLs bounce to their hash route via 404.html.

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.4.0

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number
- Updated dependencies [[`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8)]:
  - @useaccord/ui@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.2.1

## 0.2.0

### Minor Changes

- intial changeset release

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.2.0
