---
# accord-z61k
title: Reconcile stale ADR-0009 VRF text with the shipped callback architecture (CONCEPT-REVIEW Bad 16)
status: completed
type: task
priority: normal
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T15:26:11Z
parent: accord-ukqg
---

## Why

ADR-0009 describes a **caller-supplied** `commit_vrf(vrf_result)` and states that
oracle-verified VRF is "still deferred." But the code already integrated magicblock
VRF (commit `a23198c` / bean veridao-crbf): `request_vrf` (`lib.rs:793`) CPIs into
the VRF program, and `commit_vrf_callback` (`lib.rs:832`) constrains the signer to
`VRF_PROGRAM_IDENTITY` (`lib.rs:2058`). ADR-0010 assumes this callback flow. The ADR
set therefore contains **two incompatible VRF security stories** — an evaluator
cannot tell whether authenticated VRF is an accepted dependency or a deferred
target. This is a documentation defect, not a code defect (the code is in the better
state). CONCEPT-REVIEW §Bad 16 / conceptual blocker #3.

## How (agreed — docs only; code already correct)

Supersede ADR-0009's caller-commit language with the authenticated callback
architecture. State precisely:

- what the MagicBlock program authenticates (signer == `VRF_PROGRAM_IDENTITY`);
- who may request randomness (permissionless caller);
- that request params are bound (`caller_seed = dispute key`, callback accounts
  pinned);
- that the one-shot commit (`committed_vrf.is_none()` guard) prevents replacement
  after commitment;
- the residual liveness risk (provider non-response) and that it is covered by the
  escape-path task's VRF timeout → cancel.

No caller-supplied commit path remains anywhere in the docs.

## Acceptance (docs; no unit tests)

- ADR-0009 amended or superseded; a single consistent VRF story across ADRs
  0009/0010 and the README.

## References

CONCEPT-REVIEW §Bad 16; ADR-0009, ADR-0010; `lib.rs:793-847`, `lib.rs:2056-2066`;
bean veridao-crbf.

## Summary of Changes

Docs-only (code already correct). Resolves CONCEPT-REVIEW §Bad 16 — the ADR set
had two incompatible VRF stories; now a single, consistent one.

- **New ADR-0013** (`apps/docs/docs/adr/0013-vrf-authentication-via-oracle-callback.md`):
  records the as-built oracle-authenticated callback as the Accepted VRF delivery
  architecture. States precisely: (1) what the MagicBlock program authenticates
  (`signer == VRF_PROGRAM_IDENTITY`, `lib.rs:2059`); (2) that the request is
  permissionless (`caller: Signer`); (3) request-param binding (`caller_seed =
dispute.key()`, callback program/discriminator + `accounts_metas` pinning the
  dispute PDA); (4) one-shot immutability (`committed_vrf.is_none()` in both
  `request_vrf` and `commit_vrf_callback`) which structurally closes the
  brute-force the caller-supplied design only economically deterred; (5) the
  residual provider-liveness risk and its mitigation via the escape-path
  `cancel_dispute` (bean accord-18fb). Notes it is orthogonal to ADR-0012
  (snapshot layer) and retains the ADR-0008 addendum's commit/draw split
  rationale — the callback IS the separate commit tx.
- **ADR-0009** Status annotated (banner, body left immutable per convention):
  partially superseded by ADR-0013 (VRF delivery) and ADR-0012 (snapshot); the
  caller-supplied `commit_vrf(vrf_result)` language in §2 and the "oracle-
  verified VRF … still deferred" consequence are marked historical.
- **ADR-0008** addendum annotated: `commit_vrf(vrf_result)` framing superseded
  by ADR-0013; rationale retained.
- **ADR index** updated: ADR-0009 marked "Partially superseded"; ADR-0013 added
  (Accepted); reading-guide note explains 0013 supersedes the VRF-delivery
  layer of 0009.
- README (lines 260-262) and ADR-0010 were already consistent with the callback
  flow — unchanged. No caller-supplied commit path is presented as current in
  any ADR.

Verification: markdownlint clean under the repo's disabled-rules config
(MD013/MD033/MD041/MD046/MD040) on all four touched files. No code change; no
unit tests (docs-only bean).
