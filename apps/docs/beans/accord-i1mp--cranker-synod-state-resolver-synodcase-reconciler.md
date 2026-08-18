---
# accord-i1mp
title: Cranker - synod-state resolver + SynodCase reconciler scan
status: completed
type: task
created_at: 2026-08-18T19:14:13Z
updated_at: 2026-08-18T19:14:13Z
parent: accord-jm1g
---

resolveSynodAction(case, disputeState, now) mirroring canon-state.ts: Opening+full roster -> file; Opening+deadline+incomplete -> refund per joined-unpaid party; Live+Final/Failed -> claim per unclaimed party. Reconciler gains getProgramAccounts scan of SynodCase. Unit tests on the resolver.

## Summary of Changes

- `apps/cranker/src/synod-state.ts` (new) — pure `resolveSynodAction(kase,
  dispute, now)` gating the three Synod cranks exactly like the on-chain
  handlers (`file_dispute` / `refund_roster_miss` / `claim`). The dispute
  param carries `state` + `finalRuling` (broader than the milestone's boolean
  analog) so the Final claim sweep filters to the prevailing party — a
  non-winner claim is a deliberate on-chain no-op and must not consume the
  one-action-per-case cycle (livelock guard). Winner payout is one-shot
  (paid_out bit → null); neutral + Failed sweep the lowest unclaimed joined
  slot per cycle; NO_RULING-under-Final and ruling > party_count are invariant
  breaks → null.
- `packages/synod/src/queries.ts` (new) + index/README — `findAllSynodCases(rpc)`:
  discriminator-filtered decoded GPA scan, mirroring `@useaccord/canon`
  `queries.ts` (the reconciler's SynodCase discovery path).
- `apps/cranker/src/types.ts` — `CrankKind`/`CrankAction` grow
  `synod_file_dispute | synod_refund_roster_miss | synod_claim`
  (case PDA + `partyIndex` discriminator); executors + dispatch registration
  land with accord-unja / accord-y608 — unhandled kinds log + skip by design.
- `apps/cranker/src/reconciler.ts` — Phase 6: fetch every SynodCase (injectable
  `fetchSynodCases`, default `findAllSynodCases`), resolve against the bound
  dispute from the Phase-1 scan (map hoisted, shared with the Canon phase),
  stamp case address + partyIndex, dispatch once per case per cycle.
- `apps/cranker/package.json` — `@useaccord/synod` workspace dep (+ lockfile).
- Tests: `synod-state.test.ts` (16 resolver cases: every gate edge — early
  lock, deadline `>=`, joined-unpaid selection, paid_out replay no-op,
  winner/neutral/Failed dispatch, invariant breaks, terminal Closed, 7-party
  mask); reconciler phase tests extended (file dispatch, refund dispatch,
  claim-by-ruling + still-resolving no-op, unregistered-kind skip) — cranker
  suite 76/76 green; workspace `pnpm -r lint/build/test` all exit 0.
