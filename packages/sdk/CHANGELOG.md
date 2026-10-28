# @useaccord/sdk

## 0.8.3

### Patch Changes

- [#35](https://github.com/xeroc/accord/pull/35) [`81d5163`](https://github.com/xeroc/accord/commit/81d516367a05edaa4447a4169a42a692bf94a66c) Thanks [@xeroc](https://github.com/xeroc)! - sdk/jurat: fix every trace batch carrying a `step` event 403ing the daemon ingest (`signature does not verify for juror`, bean accord-r64v). `stepEvent` passes ai@7's `LanguageModelUsage` through raw, and its normalization materializes optional fields as explicit `undefined` (e.g. `inputTokenDetails.cacheWriteTokens`). jurat signs the canonical JSON of the IN-MEMORY batch while the daemon re-canonicalizes the parsed wire body — `Object.entries` kept those keys (rendered as literal `undefined`) while `JSON.stringify` drops them, desyncing the sha256 and failing Ed25519 verification. Observed live: all investigation-step batches dropped (MinIO trace gap 3–6), verdict/commit/reveal unaffected — same class as the earlier `unsealAt` fix. `canonicalJson` now mirrors `JSON.stringify` for `undefined` exactly (object entries skipped, array elements `null`), making the shared canonical form JSON-round-trip stable by construction. Pinned by an SDK wire-round-trip test and a jurat regression that drives the real provider normalization (mock-llm + real `@ai-sdk/openai-compatible`) and signs→wire→verifies the emitted step events.

## 0.8.2

No changes in this release.

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

- [#27](https://github.com/xeroc/accord/pull/27) [`190145b`](https://github.com/xeroc/accord/commit/190145b334e91295be7a8dc174f79758adb9ec1a) Thanks [@xeroc](https://github.com/xeroc)! - evidence-daemon + sdk: trace ingest authentication (ADR-0037, bean accord-sith) — `@useaccord/sdk/evidence` gains the shared ADR-0037 wire contract `canonicalJson` / `buildTraceBatchMessage` / `verifyTraceBatchSig` (Ed25519 by the juror hot key over sha256 of the canonical batch JSON, one implementation shared by the jurat signer and the daemon verifier); the daemon pipeline now gates in order: envelope shape → signature verify (403) → live `Round.jurors[]` membership via the same chain reader as delivery (403) → `seq <= last` idempotent 200 no-op (new `TraceStore.lastSeq`, fs last-line / s3 max-seq-key) → append → fan-out callback seam. Store write failure logs and still fans out. Batch caps unchanged (64 events / 256 KiB). The lockstep bump for the rest of the workspace comes from the fixed group.

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

### Patch Changes

- [#20](https://github.com/xeroc/accord/pull/20) [`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd) Thanks [@xeroc](https://github.com/xeroc)! - Fix SDK facade client wiring: `accordProgram()` (and the Canon/Synod equivalents) received the raw RPC proxy where kit 7's program-client contract requires a `ClientWithRpc` — generated fetchers read `client.rpc`, which on the proxy is a fabricated JSON-RPC method-builder. Every facade-mediated account read (`awaitCommittedVrf`, `getRuling`, juror-stake + pending-update reads) failed with `rpc.getAccountInfo is not a function`. The facades now pass `{ rpc }`; regression test pins `client.rpc === facade.rpc`. Also adds `useaccord dispute:show <pda>` — the full interpreted on-chain Dispute view (state name, ISO timestamps, sentinel interpretation, frozen CaseTerms, aggregation-labeled ruling).

- [#20](https://github.com/xeroc/accord/pull/20) [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79) Thanks [@xeroc](https://github.com/xeroc)! - SAS attestation threading for `draw_seat` clients + a meaningful gate error. The on-chain defense-in-depth re-check (PROG-ATTESTTION) required the juror's SAS attestation as `remaining_accounts[1]` on gated pools, but no client ever passed it — every gated draw reverted the red-herring `InvalidPanelSize`. The gated branch of the count check now reuses `AttestationMissing` (ungated stays `InvalidPanelSize`). SDK `drawSeat`/`buildDrawSeat` gain an optional `attestation` (read-only remaining account); new `findSasAttestation` query discovers an attestation by content (credential+schema+wallet memcmp over the SAS program); `draw:seat --attestation` forwards it explicitly, `draw:submit-panel` and the cranker's draw_seat crank resolve it per seat automatically and skip/abort with a clear remediation message when missing.

  ollow-ups from the first devnet run: `findSasAttestation` dropped its exact `dataSize: 173` filter — real SAS accounts run 205 bytes (32 trailing bytes past expiry) and RPC `dataSize` is an exact match, which silently excluded every live attestation; the three memcmp filters alone are the discovery contract. The SDK's hand-maintained `AccordErrors` map is regenerated from the IDL and bound to the generated `ACCORD_ERROR__*` constants (it ran 24 variants short and misnamed codes — 6027 InvalidPanelSize surfaced as "CommitAlreadyExists"); `errors.test.ts` pins the binding. `draw:submit-panel` gains `--from-seat` to resume partially-drawn panels (draw_seat enforces sequential seats). The SDK test glob is quoted so Node expands it — root-level test files (`accord`, `errors`, `query`) were silently skipped by the shell glob; `query.test.ts` had rotted and is repaired to the current JurorStake layout.

## 0.6.0

### Minor Changes

- [#20](https://github.com/xeroc/accord/pull/20) [`a23b1d2`](https://github.com/xeroc/accord/commit/a23b1d20aa7a8de469594546b8e9a60cf86977f5) Thanks [@xeroc](https://github.com/xeroc)! - SAS jurors: juror browse is now a simple table with a 🛡️ shield marking jurors whose SAS attestation satisfies a gated subaccord they stake in, plus a new `/juror/:address` juror detail page (per-subaccord stakes table, full SAS attestation cards: credential, schema, signer, nonce, expiry state, unlocked subaccords). The SDK gains a `sas` module — `SAS_PROGRAM_ID`, the ADR-0024 attestation decoder (byte-mirror of the on-chain `sas_layout`), and `findSasAttestations` (getProgramAccounts over the SAS program with fixed-offset credential/schema/wallet memcmp filters).

### Patch Changes

- [#20](https://github.com/xeroc/accord/pull/20) [`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd) Thanks [@xeroc](https://github.com/xeroc)! - Fix SDK facade client wiring: `accordProgram()` (and the Canon/Synod equivalents) received the raw RPC proxy where kit 7's program-client contract requires a `ClientWithRpc` — generated fetchers read `client.rpc`, which on the proxy is a fabricated JSON-RPC method-builder. Every facade-mediated account read (`awaitCommittedVrf`, `getRuling`, juror-stake + pending-update reads) failed with `rpc.getAccountInfo is not a function`. The facades now pass `{ rpc }`; regression test pins `client.rpc === facade.rpc`. Also adds `useaccord dispute:show <pda>` — the full interpreted on-chain Dispute view (state name, ISO timestamps, sentinel interpretation, frozen CaseTerms, aggregation-labeled ruling).

- [#20](https://github.com/xeroc/accord/pull/20) [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79) Thanks [@xeroc](https://github.com/xeroc)! - SAS attestation threading for `draw_seat` clients + a meaningful gate error. The on-chain defense-in-depth re-check (PROG-ATTESTTION) required the juror's SAS attestation as `remaining_accounts[1]` on gated pools, but no client ever passed it — every gated draw reverted the red-herring `InvalidPanelSize`. The gated branch of the count check now reuses `AttestationMissing` (ungated stays `InvalidPanelSize`). SDK `drawSeat`/`buildDrawSeat` gain an optional `attestation` (read-only remaining account); new `findSasAttestation` query discovers an attestation by content (credential+schema+wallet memcmp over the SAS program); `draw:seat --attestation` forwards it explicitly, `draw:submit-panel` and the cranker's draw_seat crank resolve it per seat automatically and skip/abort with a clear remediation message when missing.

  Follow-ups from the first devnet run: `findSasAttestation` dropped its exact `dataSize: 173` filter — real SAS accounts run 205 bytes (32 trailing bytes past expiry) and RPC `dataSize` is an exact match, which silently excluded every live attestation; the three memcmp filters alone are the discovery contract. The SDK's hand-maintained `AccordErrors` map is regenerated from the IDL and bound to the generated `ACCORD_ERROR__*` constants (it ran 24 variants short and misnamed codes — 6027 InvalidPanelSize surfaced as "CommitAlreadyExists"); `errors.test.ts` pins the binding. `draw:submit-panel` gains `--from-seat` to resume partially-drawn panels (draw_seat enforces sequential seats). The SDK test glob is quoted so Node expands it — root-level test files (`accord`, `errors`, `query`) were silently skipped by the shell glob; `query.test.ts` had rotted and is repaired to the current JurorStake layout.

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

### Minor Changes

- [#6](https://github.com/xeroc/accord/pull/6) [`6b5e6b8`](https://github.com/xeroc/accord/commit/6b5e6b8b2097f26c23820699802cb53afd28a990) Thanks [@xeroc](https://github.com/xeroc)! - Minimum juror position is now `min_stake` (ADR-0035): `draw_seat` requires free stake ≥ `min_stake` (the per-draw α·min_stake bond is reserved out of the floor — a juror holding exactly `min_stake` is drawable), the `stake` opening gate floors the first deposit at `min_stake`, and `reconcile_stake` ejects a fold landing strictly between 0 and `min_stake` — zero-weight leaf, remainder returned via the two-phase withdraw rail. An incoherent vote now drops the juror below the floor and ejects them outright. No IDL change.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- intial changeset release
