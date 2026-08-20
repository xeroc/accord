---
# accord-g1dy
title: Daemon - juror deliver bridge + synod route tests
status: completed
type: task
created_at: 2026-08-18T19:14:00Z
updated_at: 2026-08-18T19:14:00Z
parent: accord-7k2y
---

GET /evidence/:dispute/for/:juror serves the assembled synod group when Dispute.filer is a case PDA (chain reader resolves filer->case->group). Tests: slot guard, 409 post-file push, manifest verify happy + mismatch, deliver bridge.

## Summary of Changes

- `src/pipeline/synod-group.ts` (new) — `synodEvidenceRoot(casePda, hashes, sha256)`: the file-time root `H(case ‖ h_0 ‖ … ‖ h_{N-1})` as a pure, digest-injected helper (fixed-width 32-byte concat layout). Shared with the assembled-manifest GET (accord-lry5).
- `src/pipeline/deliver.ts` — synod deliver bridge: `DisputeView.filer` + `DeliverChainReader.readSynodCase` port; after the drawn gate, a filer that resolves to a SynodCase bound to THIS dispute routes to `deliverSynodGroup` — all slots present (else 404), root recomputed from the STORED bundles' hashes vs `evidence_hashes[0]` (mismatch ⇒ 409, juror assembly refused), per-slot unwrap + plaintext-hash tamper gate, then watermark + re-encrypt per slot with `round` = party slot. Non-synod filers fall through to the generic per-round loop unchanged. ponytail ceiling noted: appeal-round mixing not served by the bridge.
- `src/chain/reader.ts` — `DisputeView.filer` mapped; `readSynodCase` now maps decode/discriminator mismatches to `null` (a filer is an arbitrary pubkey, usually not a case).
- `src/wire.ts` — deliver chain adapter wires `filer` + `readSynodCase`; the synod ingest handler's inline chain adapter deduped onto the shared `readSynodCaseBytes`.
- `tests/helpers/accordStub.ts` — `synodCase` registration (real `getSynodCaseEncoder` bytes, SYNOD program owner, Opening/unbound default).
- Tests — `tests/synod-deliver.test.ts` (8): root-layout happy/mismatch, bridge happy (packages per slot), root-mismatch 409, missing-slot 404, swapped-ct 409, non-synod-filer + wrong-bound-dispute fall-through. `tests/synod-wire.test.ts` (7, real ECIES + encoded chain stub): push→group storage, pipeline slot guard, route slot guard (`/evidence/synod/:case/7` → 400), 409 post-file push, deliver bridge happy (juror decrypts both party packages), root mismatch 409, unseeded group 404. Daemon suite 207 pass; `tsc` + eslint clean; workspace lint/build/test green.
