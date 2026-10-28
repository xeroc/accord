# @useaccord/tests

## 0.8.2

### Patch Changes

- [#33](https://github.com/xeroc/accord/pull/33) [`83ec6a6`](https://github.com/xeroc/accord/commit/83ec6a6a595ef6ddd4b7370355cdd4c16c5a9464) Thanks [@xeroc](https://github.com/xeroc)! - evidence-daemon image: the build stage never COPYed `apps/jurat`, but the daemon's trace tests import jurat's trace sink source (`bun-run, never emitted`) — the image typecheck failed TS2307. tests: fork tripwire in `createTestEnv` (refuse mainnet/devnet-forked Surfnets with a clear error) + crash-safety unpause guard in the pause spec so a mid-test failure can't leave the singleton paused and cascade `[#6010](https://github.com/xeroc/accord/issues/6010) ProgramPaused` into every sibling spec.

- [#33](https://github.com/xeroc/accord/pull/33) [`0a5fb30`](https://github.com/xeroc/accord/commit/0a5fb30dd155773fc04e55b028a19ea57999d00b) Thanks [@xeroc](https://github.com/xeroc)! - e2e harness: slot warps migrated off the Clock-sysvar `surfnet_setAccount` workaround to `surfnet_timeTravel { absoluteSlot }` (`warpForwardSlots`/new `warpToSlot`) — surfpool 1.7.0 rejects sysvar writes as managed (surfpool#895) and lands absolute slots exactly (pre-1.7 wrapped mod slotsInEpoch). Suite now REQUIRES surfpool >= 1.7.0. `cheat()` surfaces `error.data` so rejections aren't opaque "Internal error"s.
- Updated dependencies []:
  - @useaccord/canon@0.8.2
  - @useaccord/sdk@0.8.2
  - @useaccord/synod@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.8.1
  - @useaccord/sdk@0.8.1
  - @useaccord/synod@0.8.1

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

- [#29](https://github.com/xeroc/accord/pull/29) [`6299aca`](https://github.com/xeroc/accord/commit/6299aca0f19d00ddc2cbd67b670ac23e195004b9) Thanks [@xeroc](https://github.com/xeroc)! - Fix e2e `[#6036](https://github.com/xeroc/accord/issues/6036) RevealWindowClosed` failures on slow CI runners (ADR-0038
  follow-up, bean accord-9952; broke release merges [#27](https://github.com/xeroc/accord/issues/27)/[#28](https://github.com/xeroc/accord/issues/28)):

  - `warpToRevealWindow` no longer reserves a fixed `panel + 3` seconds of
    Surfnet clock against the re-anchored `reveal_end` — that budget assumed
    ~1s of clock burn per tx, but a loaded CI runner burns ~5s/tx, so the
    reveal txs themselves overran the deadline. It now branches on panel
    state: full panel ⇒ reveal is already open via the `all committed` arm
    with the whole re-anchored `reveal_window` (2d) as headroom (no warp);
    partial panel ⇒ no re-anchor ever fired, so warp to `commit_end` with the
    whole scheduled `reveal_window` as headroom. Machine-speed independent.
  - `voting.spec` ADR-0038 test pinned `revealEnd − commitEnd === 1n`, which
    only holds when the commit loop burns zero clock (fast laptop; CI burned
    15s ⇒ got `16n`). It now pins the re-anchor formula
    `revealEnd = last_commit + reveal_window` via burn-independent bounds.
  - `appeal.spec`: dropped its stale local copy of `warpToRevealWindow` for
    the shared (fixed) helper.

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

- Updated dependencies [[`e6eaa63`](https://github.com/xeroc/accord/commit/e6eaa632eb273735d12b0896963a62550ac98872), [`190145b`](https://github.com/xeroc/accord/commit/190145b334e91295be7a8dc174f79758adb9ec1a), [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302)]:
  - @useaccord/canon@0.8.0
  - @useaccord/sdk@0.8.0
  - @useaccord/synod@0.8.0

## 0.7.0

### Patch Changes

- [#24](https://github.com/xeroc/accord/pull/24) [`6303d7b`](https://github.com/xeroc/accord/commit/6303d7b440ff60f076e54c7d6566b229c8c2f60c) Thanks [@xeroc](https://github.com/xeroc)! - Jurat Surfpool e2e: `tests/src/jurat.spec.ts` drives the full agentic-juror duty loop green (reconcile scan → join gates → auto-join → dispute → VRF draw → mock-LLM verdict through the real provider ladder + runner → commit → reveal, with `Round.reveals` and the verdict notice asserted, dryRun OFF) plus the failing-LLM twin (retry ladder exhausted → clean abstain + alert, no vote). Joining the suite required a `loadBook` robustness fix: the first-run ENOENT path now duck-types `code` instead of `instanceof Error`, which breaks on cross-realm errors (jest ESM vm contexts, workers).
- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79)]:
  - @useaccord/sdk@0.7.0
  - @useaccord/canon@0.7.0
  - @useaccord/synod@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79), [`a23b1d2`](https://github.com/xeroc/accord/commit/a23b1d20aa7a8de469594546b8e9a60cf86977f5)]:
  - @useaccord/sdk@0.6.0
  - @useaccord/canon@0.6.0
  - @useaccord/synod@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.2
  - @useaccord/sdk@0.5.2
  - @useaccord/synod@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.1
  - @useaccord/sdk@0.5.1
  - @useaccord/synod@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.0
  - @useaccord/sdk@0.5.0
  - @useaccord/synod@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.4.0
  - @useaccord/sdk@0.4.0
  - @useaccord/synod@0.4.0

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number
- Updated dependencies [[`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8)]:
  - @useaccord/canon@0.3.1
  - @useaccord/sdk@0.3.1
  - @useaccord/synod@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`6b5e6b8`](https://github.com/xeroc/accord/commit/6b5e6b8b2097f26c23820699802cb53afd28a990)]:
  - @useaccord/sdk@0.3.0
  - @useaccord/canon@0.3.0
  - @useaccord/synod@0.3.0

## 0.2.1

### Patch Changes

- Make ci go through again as we don't require evidence server in ci just yet
- Updated dependencies []:
  - @useaccord/canon@0.2.1
  - @useaccord/sdk@0.2.1
  - @useaccord/synod@0.2.1

## 0.2.0

### Minor Changes

- intial changeset release

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.2.0
  - @useaccord/sdk@0.2.0
  - @useaccord/synod@0.2.0
