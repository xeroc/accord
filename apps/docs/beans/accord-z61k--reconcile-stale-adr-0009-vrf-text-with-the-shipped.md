---
# accord-z61k
title: Reconcile stale ADR-0009 VRF text with the shipped callback architecture (CONCEPT-REVIEW Bad 16)
status: todo
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
