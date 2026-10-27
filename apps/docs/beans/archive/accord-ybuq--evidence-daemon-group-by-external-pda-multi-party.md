---
# accord-ybuq
title: Evidence daemon — group-by-external-PDA + multi-party manifests (Synod)
status: completed
type: task
priority: normal
created_at: 2026-08-18T05:00:56Z
updated_at: 2026-08-18T22:03:57Z
parent: accord-7k2y
---

DECIDED in PROG-MULTI-PARTY grilling session 2026-08-18 (Q-i); spec'd in programs/synod/SPEC.md §Evidence integration.

## What

apps/evidence-daemon gains a PRE-DISPUTE GROUPING KEY: the Synod case PDA (hex of base58). N parties push encrypted evidence bundles independently for a not-yet-created Accord dispute, grouped by case + party slot. Daemon assembles a multi-bundle manifest (ADR-0017 + party field) and verifies at file time that the assembled set matches the on-chain commitment evidence_hash[0] = H(case_pda ‖ h_0 ‖ … ‖ h_{N-1}) — PDA identifies, per-party hashes COMMIT (detects daemon bundle-swap).

## Scope

- Daemon: grouping/indexing by external program PDA; manifest assembly from per-party bundles; publish + verify against commitment.
- Crypto UNCHANGED (ADR-0015 — ECIES/AES-GCM/HKDF all from @useaccord/sdk/evidence; no new primitives).
- SDK: @useaccord/sdk/evidence helpers for per-party upload receipt → on-chain hash flow (if needed).

## Not in scope

- Synod program itself (programs/synod/SPEC.md — separate build).
- Manifest format overhaul beyond the party field.

## Dependencies

- Synod v1 build (case PDA shape must exist) — blocked-by Synod milestone when created.

## REWRITTEN SCOPE (2026-08-18 — supersedes content above)

Grilling resolved the shape; implementation lives under milestone accord-daq8 (epic accord-7k2y). Decisions:

- Dedicated `/synod/` route namespace: `POST /evidence/synod/:case/:party` (slot 0–6) and `GET /evidence/synod/:case`. Existing dispute-keyed routes untouched (canon keeps them).
- Pushes are unauthenticated by design — the on-chain per-party hash committed at `join` IS the commit; junk bundles fail the post-file root verification.
- 409 on push after the dispute is filed.
- Manifest GET post-file: recompute `H(case_pda ‖ h_0 … h_{N-1})` vs `Dispute.evidence_hashes[0]` → `verified` flag; mismatch ⇒ `verified: false` + juror assembly refused.
- Juror deliver bridges dispute → filer = case PDA → group.
- Crypto unchanged (ADR-0015); no new primitives.

This bean now tracks ingest + grouping only; sibling tasks under accord-7k2y cover manifest-verify and deliver-bridge + tests.

## Summary of Changes

Umbrella bean — every rewritten-scope decision shipped via the three sibling tasks under accord-7k2y (this bean tracked ingest + grouping; verification, manifest, and deliver-bridge were the siblings'):

- `POST /evidence/synod/:case/:party` — pre-dispute grouping by case PDA + slot, unauthenticated pushes, 409 once `SynodCase.dispute` is bound, per-slot hash idempotency; storage rides the existing `{subaccord}/{dispute}/{round}` store key with `dispute := case PDA`, `round := party slot` (zero store-trait changes; a synod-program PDA can never collide with an Accord Dispute PDA). → commit e05bcd1 (accord-1viq).
- Juror deliver bridge — `GET /evidence/:dispute/for/:juror` resolves `Dispute.filer` → case → group when bound; one package per party slot (`round` = slot), gated by the recomputed file-time root `H(case ‖ h_0…h_{N-1}) == evidence_hashes[0]`; mismatch ⇒ 409, assembly refused. Pure root helper shared downstream. → commit 065ea48 (accord-g1dy).
- `GET /evidence/synod/:case` — assembled multi-bundle manifest (ADR-0017 payloads + `party` field, daemon-decrypted in memory), partial pre-file view, post-file `verified` flag from the same root recompute. → commit 357547c (accord-lry5).
- Crypto unchanged (ADR-0015): all paths import `@useaccord/sdk/evidence`; nothing hand-rolled. The original scope's optional "SDK upload-receipt helpers" were not needed — `claimantEncrypt` already yields the `plaintext_hash` the app commits at `join`.
- Verification: daemon suite 217 pass, `tsc` + eslint clean, workspace `pnpm -r lint/build/test` green; routes + docs (daemon README, SPEC endpoint table) updated in the same commits.
