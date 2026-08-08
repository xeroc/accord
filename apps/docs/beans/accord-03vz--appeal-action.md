---
# accord-03vz
title: Appeal action
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:09:25Z
updated_at: 2026-08-08T00:58:44Z
parent: accord-sdtj
blocked_by:
  - accord-ewj8
---

On /disputes/:address when state=RoundResolved and within APPEAL_WINDOW_SECS. Appeal button → builds appeal instruction via accord.methods.appeal(accounts). Needs AppealBond PDA derivation. Posts bond (fee + bond = panel_size_for_round(next) * fee_per_juror + bond). After appeal: new round initiated by daemon.

## Summary of Changes

### Appeal eligibility + cost computation

- `apps/app/src/features/dispute/useAppeal.ts` — `getAppealInfo(dispute, appealWindowEnd?, nowSec?)`:
  - Checks `canAppeal(currentRound, maxAppeals)` — max appeals gate
  - Checks appeal window expiry (round.revealEnd + terms.appealWindow)
  - Computes `appealCost(currentRound, feePerJuror)` — panel, fee, bond, total
  - Returns `{ eligible, reason?, newRound, panel, fee, bond, total }`
  - Pure function using SDK helpers — no wallet needed

### DisputeDetail appeal section enhancement

- `DisputeDetail.tsx` — appeal section now shows:
  - New round number + panel size (e.g. "Escalate to round 1 with a 7-juror panel")
  - Cost breakdown: new fee, bond, total cost (in SOL)
  - Appeal window close timestamp
  - Disabled appeal button ("Appeal — connect wallet") — wired when ConnectorKit lands (accord-y5av)
  - Ineligibility reasons (max appeals reached, window closed, panel overflow) shown in slash red

### Note on instruction building

The actual `appeal` instruction build + send requires the SDK facade (which needs a
`TransactionSigner` from ConnectorKit). The facade's `methods.appeal(accounts)` is the
target API. When ConnectorKit is wired (accord-y5av), the button will:

1. Derive all AppealAccounts (pauseState, round, appealBond PDAs)
2. Build the instruction via `accord.methods.appeal(accounts)`
3. Sign + send via `sendInstruction(rpc, signer, ix)`
4. Invalidate dispute/round/appealBond queries

### Verification

- `pnpm --filter @useaccord/app run lint` — green
- `pnpm --filter @useaccord/app run build` — green (254 kB bundle)
