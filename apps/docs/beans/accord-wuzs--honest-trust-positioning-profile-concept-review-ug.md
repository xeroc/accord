---
# accord-wuzs
title: Honest trust / positioning profile (CONCEPT-REVIEW Ugly 8)
status: todo
type: task
priority: normal
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T20:10:03Z
parent: accord-ukqg
---

## Why

Critical power and liveness are distributed among several privileged or
economically concentrated roles: the Subaccord authority (rule changes), the Squads
multisig (pause + upgrade), the off-chain indexer (proposed juror population), a
wealthy challenger class, the external VRF provider (randomness availability), the
cranker (draw advancement), large stakeholders (selection dominance), the trusted
evidence operator, and the integrating application (whether the ruling is honored).
None individually invalidates the project, but together they make "decentralized
court" / "Kleros of Solana" an overstatement. CONCEPT-REVIEW §Ugly 8.

## How (agreed — docs, not program code)

Publish a per-Subaccord machine-readable **trust profile**: authority, juror
admission model (key-level pseudonymous — not independent humans), stake
concentration metric, snapshot-poster model, randomness dependencies, evidence
operator, security value ceiling, and enforcement boundary (oracle output, not
self-enforcing). Qualify all product/README claims. Accurate one-liner:

> A configurable, capital-weighted Schelling arbitration oracle with optimistic
> off-chain juror indexing, externally supplied randomness, trusted
> confidential-evidence delivery, temporary privileged governance, and
> application-level enforcement.

## Acceptance (docs; no unit tests)

- Trust-profile spec doc under `apps/docs`.
- All README / docs / ADR claims about decentralization are qualified.
- ADR-0007 and ADR-0009 state their residual trust assumptions plainly.

## References

CONCEPT-REVIEW §Ugly 8; ADR-0001; `CONTEXT.md`.
