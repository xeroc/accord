---
# accord-oeem
title: Synod state + constants + errors skeleton, layout pin tests
status: todo
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T05:28:20Z
parent: accord-l2ad
blocked_by:
    - accord-8ymx
---

assigned: implementer
Mirror canon crate layout: constants.rs (SEED_CASE etc., MAX_PARTIES=7, bounds), state.rs (SynodCase + CaseState per SPEC §Account model — parties[7], joined/paid_out bitmasks, frozen fee, evidence[7], dispute sentinel), error.rs (AccordError-style enum: party-count, not-named-party, already-joined, not-opening, roster-incomplete, pot-not-positive, aggregation, deadline). Host layout-pin tests like accord tests.rs (offsets_match_borsh discipline). SPEC §2 is the field list authority. TDD: layout tests first.
