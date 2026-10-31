# @useaccord/cli

## 0.8.4

No changes in this release.

## 0.8.3

No changes in this release.

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

### Patch Changes

- [#20](https://github.com/xeroc/accord/pull/20) [`38326b5`](https://github.com/xeroc/accord/commit/38326b548d9b4a12d98cfeb92af283873305a957) Thanks [@xeroc](https://github.com/xeroc)! - `useaccord` now dumps the full validator log lines whenever a transaction fails simulation — human mode prints a `transaction logs:` block on stderr, `--json` includes a `logs` array. Kit ≥7's preflight `SolanaError` shape (program code on a nested cause, logs in context) is decoded, so failed sends map back to their Accord error names instead of a bare "Transaction simulation failed".

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

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- intial changeset release
