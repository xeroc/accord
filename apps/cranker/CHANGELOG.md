# @useaccord/cranker

## 0.8.2

### Patch Changes

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

- [#27](https://github.com/xeroc/accord/pull/27) [`5a80fbc`](https://github.com/xeroc/accord/commit/5a80fbc7aff97cbceab45c07cc5dd1bddeee0069) Thanks [@xeroc](https://github.com/xeroc)! - Readable failure logs. The cranker no longer emits `SolanaError: Solana error #-32002; Decode this error by running npx @solana/errors decode … '<base58 blob>'`: the service neutralises `@solana/errors` v7's production-mode message stripping at boot (the Docker image sets `NODE_ENV=production`), and simulation/on-chain failures now lead with the actual program reason parsed from the validator logs (`AnchorError … Error Code: Xxx … Error Message: …`, panics, or `custom program error: 0xNN`). Every crank and tx log line — including failures — is tagged with the subaccord (and dispute/item/case) it belongs to, and a failing crank action is logged and skipped instead of aborting the whole reconcile cycle, so one stuck account can no longer starve the rest of the cycle.

- [#28](https://github.com/xeroc/accord/pull/28) [`f06c7ab`](https://github.com/xeroc/accord/commit/f06c7ab75ef5ff48986897f3583d46a8b5b2b85f) Thanks [@xeroc](https://github.com/xeroc)! - Docker images (bean accord-a8a9):

  - New `apps/jurat/Dockerfile` — jurat juror-daemon image (same workspace pnpm
    - `pnpm deploy` + bun-runtime pattern as the cranker), built and pushed by
      the Release workflow as `ghcr.io/xeroc/useaccord-jurat`.
  - Cranker/evidence-daemon Dockerfiles: copy EVERY lockfile importer's
    manifest again — `packages/ui`, `apps/{canon,synod,hanse,pitch,remotion,jurat}`
    were missing, so `pnpm install --frozen-lockfile` failed at the deps stage.
  - `.dockerignore`: jurat added to the root-context builds; manifest-only
    members' sources excluded from the context.

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
