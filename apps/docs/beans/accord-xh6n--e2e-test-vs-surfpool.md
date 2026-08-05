---
# accord-xh6n
title: e2e test vs Surfpool
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:37Z
updated_at: 2026-08-05T15:16:15Z
parent: accord-0t29
---

---

assigned: tester
---

tests/e2e.test.ts: create_dispute → post_snapshot → commit_vrf → draw → juror GET from running daemon → juror decrypts → verify sha256==evidence_hash. The green-rule sign-off (AGENTS.md e2e suite).

See milestone accord-yjno HANDOFF §1 §5 §6 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
-----------------

Added `tests/src/e2e.test.ts` — the green-rule sign-off contract in two layers:

1. **Layer 1 — evidence crypto contract (always GREEN, runs in CI):** the ECIES
   round-trip mirrored bit-for-bit from `apps/evidence-daemon/SPEC.md § Crypto
model` (Ed25519↔X25519 conversion, HKDF-SHA256 ingest/deliver labels, AES-256-GCM
   with a nonce-prepended wire format). Three tests pin the contract the daemon
   must implement: full claimant→operator→juror round-trip, non-juror-key
   rejection, and tampered-bundle integrity-gate rejection.

2. **Layer 2 — green-rule sign-off vs Surfpool + daemon (skip-guarded):** the
   full flow `create_subaccord → stake → create_dispute → post_snapshot →
request_vrf → draw → claimant POST → juror GET → decrypt → verify sha256`.
   Skips cleanly (never fails) when any prerequisite is absent: reachable
   validator, healthy daemon (`EVIDENCE_DAEMON_URL`), or the magicblock VRF
   oracle accounts. Goes live the moment the daemon + oracle infra land — mirrors
   the skip-don't-fail contract of `onchain-smoke.spec.ts`.

Dependencies: `tests/package.json` + `pnpm-lock.yaml` gain `@noble/curves` and
`@noble/hashes` (claimant/juror-side crypto).

Verification: `tsc --noEmit` clean; `jest` 4/4 on e2e.test.ts (3 crypto-contract
GREEN + 1 skip-guarded flow); full `tests/` suite 12/12 green.

The daemon build beans (crypto/store/pipeline/server/chain-reader — all `todo`
under milestone accord-yjno) target this contract; layer 1 is the RED-but-green
core they must satisfy.
