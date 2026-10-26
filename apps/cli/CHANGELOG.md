# @useaccord/cli

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
