---
# accord-8pd1
title: e2e specs — open/join/file/refund/claim per-instruction
status: completed
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-ndl9
blocked_by:
    - accord-al8h
---

assigned: tester
One spec file per instruction group (synod.open-join / synod.file / synod.refund / synod.claim) covering every HANDOFF §6 matrix row: validation errors, full-roster file + vault invariant, roster-miss refunds + idempotency, winner pot / neutral floor+remainder / Failed full refund, Median gate, N*S>fee gate. fetchDecoded + account decoders re-exported from @useaccord/synod — NOT facade fetch methods needing ClientWithRpc (setup/assertions rule). Whole suite must run GREEN together on one Surfnet.

## Summary of Changes

Four spec files (24 tests) + shared harness, all GREEN in `make test` (24/24 suites, 96/96 tests, 0 skipped):

- `tests/src/synod-harness.ts` — shared composite (draw-harness pattern): `armSynodCourt` (pause singleton + armed Subaccord via `armSubaccordAndJurors` so Accord's `staker_count >= min_jury_size` intake gate passes), open/join/file/claim/refund composers, `forceDisputeOutcome` (decode → mutate state/ruling → re-encode → `surfnet_setAccount` — the draw/vote/finalize chain is Accord's own e2e coverage), balance readers.
- `synod.open-join.spec.ts` — open happy (roster/fee frozen/dispute sentinel/padding), gates: 8 parties, dupes, opener ≠ parties[0], Median, N·S ≤ fee, deadline ≤ now; join happy (S lock, evidence slot, joined bit), gates: non-named wallet, double join, post-deadline.
- `synod.file.spec.ts` — real CPI file: dispute bound = `["dispute", case, 0]`, filer = case PDA, options == `synodOptionLabel` (u64-LE KAT), `evidenceHashes[0] == synodEvidenceHash`, vault = N·S − fee, state Live; 7-party → 8 options; gates: incomplete roster, double file, join-after-Live.
- `synod.refund.spec.ts` — post-deadline refunds of non-contiguous joined bits, idempotent replay, Closed transition, vault drains; gates: pre-deadline, non-joined party, full roster (RosterComplete) + early-lock sanity.
- `synod.claim.spec.ts` — DisputeNotFinal pre-outcome; winner pot once (non-winner no-op, replay no-op, closes); neutral split ⌊pot/N⌋ with last-claimant drain (N=2, pot 1985 → 992/993); Failed full-S refunds with simulated cancel-fee return.

**Integration bugs found by e2e (LiteSVM missed both) — fixed in this commit:**

1. *Writable-privilege escalation*: synod's `FileDispute.subaccord` was readonly but Accord's `CreateDispute.subaccord` is `mut` (writes `fee_vault_deposited` in the CPI). Fixed `#[account(mut, …)]` (canon challenge_item precedent; LiteSVM does not enforce CPI privilege escalation).
2. *Data-carrying rent payer*: Accord's `create_dispute` used the filer as rent payer — the system program rejects rent transfers from the data-carrying case PDA (`Transfer: 'from' must not carry data`). This was the long-standing canon×accord BLOCKER (canon.challenge.spec had been `it.skip` on it). Added a data-free `rent_payer: Signer` to Accord's `CreateDispute` (dispute init + fee_vault init_if_needed payers); canon passes the challenger, synod passes the permissionless caller. Full change coupling: SDK `CreateDisposeAccounts.rentPayer` + adapter + every TS caller (dispute/draw-harness/appeal/reclaim/evidence/e2e/CLI/app), 16 LiteSVM sites, SPEC tables, codegen. **canon.challenge.spec un-skipped and GREEN** (fixed its stale bigint assertion) — first green canon CPI e2e.

Also: `@useaccord/synod` facade completed (absorbed accord-nsxa's scope — pda.ts/methods.ts/fetch.ts/index.ts mirroring canon; the Synod client class omitted as nothing consumes it), tests-package dep, fixtures re-pinned to program truth (u64-LE option index, floor(pot/N) neutral split — matched `claim.rs`), SYNOD_PROGRAM_ID now sourced from the SDK, smoke test re-pinned to the canonical program id.

Environment notes: box port 8899 was held by the user's Mash Surfnet (killed with user approval mid-session); a default-port `surfpool start --yes --db :memory: --no-tui --offline` net is required for local full-suite runs (mainnet-fork datasources fail lazy account fetches — no egress).
