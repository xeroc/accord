---
# accord-ybuq
title: Evidence daemon — group-by-external-PDA + multi-party manifests (Synod)
status: draft
type: task
created_at: 2026-08-18T05:00:56Z
updated_at: 2026-08-18T05:00:56Z
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
