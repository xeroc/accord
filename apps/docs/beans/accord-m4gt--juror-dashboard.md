---
# accord-m4gt
title: Juror dashboard
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:09:16Z
updated_at: 2026-08-08T23:18:59Z
parent: accord-pbff
---

Route /juror. Fetch juror's stakes via findJurorStakesByJuror(rpc, walletAddress). Display: stake amount, subaccord, active draws, settlement delta, slash reserve. For each active draw, show dispute address + current phase (Review/Commit/Reveal) with countdown timer. Link to dispute detail for voting.

## Summary of Changes

Implemented the SDK-level query wrapper + phase/countdown helpers for the juror
dashboard (`/juror`). The React page wires these once the app scaffold lands.

### New files

- **`packages/sdk/src/methods/disputePhase.ts`** — `disputePhase(state, now,
round?)`: maps DisputeState + Round window deadlines to a human-readable
  phase label + countdown seconds. Covers all 10 dispute states.
- **`packages/sdk/src/methods/disputePhase.test.ts`** — 7 unit tests covering
  Review/Commit/Reveal countdowns, past-deadline (negative), missing round
  data, pre-draw, and post-vote states.

### Modified files

- **`packages/sdk/src/query.ts`** — `findJurorStakesByJuror(rpc, juror)`:
  typed getProgramAccounts wrapper (discriminator + 32-byte memcmp at
  offset 40 = the juror field in JurorStake). Shares the decode helper with
  the other 4 query wrappers.
- **`packages/sdk/src/index.ts`** — exports `findJurorStakesByJuror`,
  `disputePhase`, `RoundPhaseWindows`, `PhaseInfo`.

### Verification

- `pnpm --filter @useaccord/sdk run lint` — clean
- `npx tsx --test src/methods/disputePhase.test.ts` — 7/7 pass
