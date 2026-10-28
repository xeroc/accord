# @useaccord/canon-app

## 0.8.2

### Patch Changes

- Updated dependencies [[`272e9ca`](https://github.com/xeroc/accord/commit/272e9caa429c80ffb3cc4d994f4c37209ec25141)]:
  - @useaccord/ui@0.8.2
  - @useaccord/canon@0.8.2
  - @useaccord/sdk@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.8.1
  - @useaccord/sdk@0.8.1
  - @useaccord/ui@0.8.1

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

- Updated dependencies [[`e6eaa63`](https://github.com/xeroc/accord/commit/e6eaa632eb273735d12b0896963a62550ac98872), [`190145b`](https://github.com/xeroc/accord/commit/190145b334e91295be7a8dc174f79758adb9ec1a), [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302)]:
  - @useaccord/canon@0.8.0
  - @useaccord/sdk@0.8.0
  - @useaccord/ui@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79)]:
  - @useaccord/sdk@0.7.0
  - @useaccord/canon@0.7.0
  - @useaccord/ui@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79), [`a23b1d2`](https://github.com/xeroc/accord/commit/a23b1d20aa7a8de469594546b8e9a60cf86977f5)]:
  - @useaccord/sdk@0.6.0
  - @useaccord/canon@0.6.0
  - @useaccord/ui@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.2
  - @useaccord/sdk@0.5.2
  - @useaccord/ui@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.1
  - @useaccord/sdk@0.5.1
  - @useaccord/ui@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.5.0
  - @useaccord/sdk@0.5.0
  - @useaccord/ui@0.5.0

## 0.4.0

### Minor Changes

- [#12](https://github.com/xeroc/accord/pull/12) [`895cf9d`](https://github.com/xeroc/accord/commit/895cf9dcb67cbad3c3c1eeb9530a07b6837c49a4) Thanks [@xeroc](https://github.com/xeroc)! - evidence: daemon URL and operator pubkey follow the selected cluster, configurable per cluster via Vite env — `VITE_EVIDENCE_DAEMON_URL_{DEVNET,MAINNET,LOCALNET}` (defaults: `api.devnet.useaccord.xyz` for devnet, `api.useaccord.xyz` for mainnet, devnet's value for localnet) and `VITE_EVIDENCE_OPERATOR[_ADDRESS]_{DEVNET,MAINNET,LOCALNET}` (default: unset = no operator, localnet falls back to devnet's); replaces the single build-time `VITE_EVIDENCE_DAEMON_URL` / `VITE_EVIDENCE_OPERATOR[_ADDRESS]`

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.4.0
  - @useaccord/sdk@0.4.0
  - @useaccord/ui@0.4.0

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number
- Updated dependencies [[`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8)]:
  - @useaccord/canon@0.3.1
  - @useaccord/sdk@0.3.1
  - @useaccord/ui@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`6b5e6b8`](https://github.com/xeroc/accord/commit/6b5e6b8b2097f26c23820699802cb53afd28a990)]:
  - @useaccord/sdk@0.3.0
  - @useaccord/canon@0.3.0
  - @useaccord/ui@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.2.1
  - @useaccord/sdk@0.2.1
  - @useaccord/ui@0.2.1

## 0.2.0

### Minor Changes

- intial changeset release

### Patch Changes

- Updated dependencies []:
  - @useaccord/canon@0.2.0
  - @useaccord/sdk@0.2.0
  - @useaccord/ui@0.2.0
