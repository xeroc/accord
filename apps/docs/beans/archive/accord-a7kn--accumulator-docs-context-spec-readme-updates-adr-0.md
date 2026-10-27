---
# accord-a7kn
title: "Accumulator — docs: CONTEXT / SPEC / README updates (ADR-0012)"
status: completed
type: task
priority: normal
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-05T17:12:02Z
parent: accord-g74z
---

## Why

The accumulator replaces the snapshot layer; user-facing docs must reflect the
new model and stop describing post/challenge/finalize, the bond, and the 1-day
window.

## Scope

- **CONTEXT.md**: update the Snapshot/Draw terms (no posted snapshot; live
  accumulator; root frozen at VRF-commit). Add an _Accumulator_ term.
- **programs/accord/SPEC.md**: rewrite the snapshot/draw sections for the
  accumulator + per-seat `draw_seat`; update the account/seed tables
  (`Subaccord` +accumulator fields; `JurorStake` +`tree_index` −`last_change_slot`;
  `Dispute` +`frozen_root`; remove the `Snapshot` account + bond flows).
- **README**: update the dispute-lifecycle diagram and the snapshot-trust
  description (canonical root, no fraud window).
- Purge user-facing references to the 1-day challenge window, snapshot bond, and
  the four fraud predicates.

## Acceptance

- Docs describe the accumulator model accurately.
- No stale snapshot/fraud-window references in user-facing docs.

## References

ADR-0012; `accord-g74z`; CONTEXT.md.

## Summary of Changes

Migrated the user-facing docs from the optimistic-snapshot model to the live
on-chain stake accumulator (ADR-0012): `post_snapshot` / `challenge_snapshot` /
`finalize_snapshot`, the snapshot bond, the 1-day challenge window, the four
fraud predicates, `last_change_slot`, and the `Snapshot` account are purged;
replaced by the canonical accumulator root on `Subaccord`, per-seat `draw_seat`,
`tree_index` on `JurorStake`, and `frozen_root` on `Dispute` (set at
`commit_vrf_callback`).

Files changed (19):

- `CONTEXT.md` — Snapshot term → Accumulator term; Draw term updated (per-seat,
  root frozen at VRF-commit).
- `programs/accord/SPEC.md` — account/PDA table, instruction table, state
  machine, edge cases, references rewritten for the accumulator.
- `README.md` — sortition feature, lifecycle mermaid, account table, draw
  section, ADR list (adds 0011/0012, marks 0003/0008/0009 superseded).
- `apps/docs/docs/` mkdocs site sweep: `index`, `quickstart`,
  `integration/{index,disputes,draw-voting,appeals,staking}`,
  `security/{index,fraud-proofs,sortition-vrf}` (the fraud-proofs page is now
  the accumulator trust-model page — filename kept so links resolve),
  `reference/{accounts,instructions,state-machine,constants,errors}`, `sdk`.

Verification: `markdownlint-cli 0.45.0` clean on all 19 files (MD013/033/041/
046/040 disabled per repo `.pre-commit-config.yaml`). No code changed → no
typecheck/tests apply.

Intentionally NOT touched (out of scope, follow-up):

- `programs/accord/security-checklist.md` — audit workbook citing live code at
  `file:line`; the code still has `Snapshot` pre-refactor. Must track the code
  change, not this docs bean.
- `apps/evidence-daemon/SPEC.md` — separate subsystem (evidence milestone
  accord-yjno); one stale e2e line.
- Root `AGENTS.md` — operational build authority; its v1 instruction-set list +
  ADR authority line still name post_snapshot/challenge_snapshot and ADR-0008/0009
  without the 0012 supersession. Drafted as follow-up bean accord-46r3.
- ADRs 0003/0008/0009/0010 — immutable per docs convention; their supersession is
  recorded in the ADR index and ADR-0012 itself.
