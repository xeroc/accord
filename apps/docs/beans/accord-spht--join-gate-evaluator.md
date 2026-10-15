---
# accord-spht
title: Join-gate evaluator
status: completed
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T10:32:00Z
parent: accord-n5v4
---

src/join/gates.ts pure function Subaccord→JoinDecision with reasons: token allowlists, min_stake + fee_per_juror ranges, alpha_bps cap, Plurality only, commit_window floor, global budget, per-subaccord cap, reserve floor. AC: table-driven unit tests incl. boundary cases; every reject path carries a reason.

## Summary of Changes

- `apps/jurat/src/join/gates.ts` — `evaluateJoinGate(sub, policy, ctx?)`: the pure worthiness half of join policy (milestone accord-g69g decision 3, full conservative set):
  - `StakingTokenNotAllowed` / `FeeTokenNotAllowed` — both mints must be on their allowlists (`ReadonlySet<Address>`).
  - `MinStakeOutOfRange` / `FeePerJurorOutOfRange` — pool parameters within configured inclusive ranges.
  - `AlphaTooHigh` — `alpha_bps` ≤ cap.
  - `NonPluralityAggregation` — v1 joins Plurality pools only (Median deferred to v2 per the milestone non-goals).
  - `CommitWindowTooShort` — `commit_window` ≥ floor (agent runtime budget).
  - `OverSubaccordCap` / `OverGlobalBudget` / `InsufficientReserve` — static budget arithmetic over `JoinContext` (`stakedElsewhere`, optional `stakingTokenBalance`; the reserve gate is skipped when the balance is unknown at scan time and the executor enforces it against the live balance before sending).
  - Every reject carries `reason` + human-readable `detail` with the offending numbers. All limits inclusive at the edge.
  - `JoinPolicy` is the config-fed shape (bean accord-jxpn maps env → this); `JoinDecision`/`JoinRejectReason` exported for the discovery loop.
- `apps/jurat/src/join/gates.test.ts` — table-driven suite: baseline accept, an all-boundaries-at-the-limit accept row, 11 reject rows (one per gate, each with a `detail` regex pinning the numbers), plus the unknown-balance reserve-skip row.

Verification: `bun test` 41/41 green (whole jurat suite: gates + executor + reconcile + book), `tsc --noEmit` green.
