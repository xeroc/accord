---
# accord-27r5
title: Accord Cranker Service
status: completed
type: milestone
priority: normal
created_at: 2026-08-09T20:13:41Z
updated_at: 2026-08-09T23:21:55Z
---

## Overview

A standalone service (`apps/cranker/`) that advances disputes through their lifecycle by calling permissionless instructions at the right time. Protocol-subsidized: the cranker holds a funded keypair and pays for all txs.

## Architecture (agreed)

**Reconciler is authoritative; WS is latency optimization.**

```
Reconciler loop (every 60s)
  1. getProgramAccounts(Dispute, non-terminal)
  2. For each: read state → resolve next action
  3. If deadline passed → fire crank tx
  4. If deadline future → schedule (checked on next cycle)

WS Listener (optimization)
  program logs → trigger immediate reconcile for that dispute

Tree Cache (per-Subaccord MST)
  getProgramAccounts(JurorStake) → buildAccumulator → proofFor
  Verify reconstructed root == dispute.frozen_root before draw_seat
```

Key decisions:

- **60s poll interval** (not 10s — disputes progress over days, not seconds)
- **No bundling** — one instruction per tx; simpler retry logic
- **Retry + priority fee escalation** on first failed inclusion
- **SDK-first**: use @useaccord/sdk for all instruction builders, tree builders, decoders
- **Funded keypair** for all crank txs; no economic model yet (may later share fees)

## Crank lifecycle (permissionless instructions)

| Crank | Trigger | When |
|---|---|---|
| request_vrf | Dispute in Created, committedVrf is None | immediately |
| draw_seat × N | committedVrf set, panel not full | immediately |
| finalize_round | now ≥ round.revealEnd | after reveal window |
| finalize_dispute | now ≥ revealEnd + appealWindow, no appeal | after appeal window |
| settle_round | Dispute is Final, prior rounds unsettled | after finalization |
| cancel_dispute | now > filedAt + timeout | after stall timeout |
| redraw | Dispute is RedrawEligible | immediately |
| execute_subaccord_update | slot ≥ executeAfterSlot | after timelock |
| execute_unpause | slot ≥ pendingUnpauseAfter | after timelock |
| claim_appeal_refund | Dispute Final/Failed, bond outstanding | after finalization |

## HANDOFF

### 1. Happy Path

1. Cranker starts, loads funded keypair from env
2. Reconciler scans all non-terminal Disputes via getProgramAccounts
3. For a Dispute in Created without VRF: sends request_vrf
4. WS detects VrfCommitted event → triggers immediate reconcile
5. Reconciler sees committedVrf set → builds tree cache → sends draw_seat × N
6. Panel fills → windows open → after reveal_end, sends finalize_round
7. After appeal_window, sends finalize_dispute
8. After Final, sends settle_round for each prior round

### 2. Data Contract

- Package: `apps/cranker/` (pnpm workspace, `@useaccord/cranker`)
- Env vars: `ACCORD_RPC_URL`, `ACCORD_WS_URL`, `ACCORD_CRANKER_KEYPAIR` (path to id.json)
- SDK imports: `@useaccord/sdk` for all instruction builders, account decoders, `buildAccumulator`, `proofFor`
- State resolver: `(dispute: DecodedDispute, round: DecodedRound | null, now: bigint) => CrankAction | null`
- Crank dispatch: each crank is a separate file in `src/cranks/`; registered via a dispatch map

### 3. Edge Cases & Constraints

- **Frozen root mismatch**: if a juror called request_withdraw between VRF commit and draw, the live tree root diverges from dispute.frozenRoot. The cranker MUST verify its reconstructed root matches frozenRoot before submitting draw_seat txs. If mismatch: skip draw, retry next cycle. (Draft bean accord-cranker-frozen for future hardening.)
- **draw_seat is one tx per seat** (1232-byte limit). Up to 31 txs for a 3rd-appeal panel.
- **Retry logic**: on tx send failure (not simulation failure), retry with higher priority fee. On simulation failure (wrong state), skip — another cranker or the user may have advanced it.
- **No bundling**: one instruction per tx. Period.
- **claim_appeal_refund** is appellant-motivated (not strictly a cranker job), but the cranker should handle it for completeness.

### 4. Business Logic (pseudo-code)

```typescript
// Reconciler loop
async function reconcile() {
  const disputes = await getActiveDisputes();
  for (const d of disputes) {
    const action = resolveNextAction(d, await getRound(d), now());
    if (action) await executeCrank(action);
  }
}
setInterval(reconcile, 60_000);

// State resolver
function resolveNextAction(d, round, now): CrankAction | null {
  // Created without VRF → request_vrf
  // Created with VRF, panel not full → draw_seat
  // Drawn/Commit/Reveal, now >= revealEnd → finalize_round
  // RoundResolved, now >= revealEnd + appealWindow → finalize_dispute
  // RedrawEligible → redraw
  // Final, prior rounds unsettled → settle_round
  // Created, now > filedAt + timeout → cancel_dispute
}
```

### 5. Definition of Done

- [ ] apps/cranker/ scaffolded as pnpm workspace package
- [ ] .env.example with ACCORD_RPC_URL, ACCORD_WS_URL, ACCORD_CRANKER_KEYPAIR
- [ ] Reconciler loop runs at 60s interval, scans all non-terminal disputes
- [ ] State resolver covers all 10 crank actions
- [ ] Each crank implemented as separate file using SDK instruction builders
- [ ] Tree cache builds MST from getProgramAccounts, verifies frozen root
- [ ] draw_seat sends one tx per seat with Merkle proof from SDK
- [ ] WS listener triggers immediate reconcile on program log events
- [ ] Retry logic: on send failure, escalate priority fee and retry
- [ ] All cranks use the SDK (no raw instruction encoding)
- [ ] TypeScript builds clean (tsc --noEmit)
- [ ] Logs each crank action with dispute address + instruction name

### 6. Test Matrix (Given / When / Then)

- Given a Dispute in Created, When reconciler runs, Then request_vrf is sent
- Given a Dispute with committedVrf, When reconciler runs, Then draw_seat txs are sent
- Given a Dispute past reveal_end, When reconciler runs, Then finalize_round is sent
- Given a Dispute past appeal_window, When reconciler runs, Then finalize_dispute is sent
- Given WS disconnect, When 60s passes, Then reconciler still advances disputes
- Given frozen root mismatch, When draw_seat attempted, Then cranker skips and retries next cycle

### 7. Open Questions

- VRF oracle reliability on mainnet (assumed reliable per discussion)
- Economic model for cranker compensation (deferred — protocol-subsidized for now)
- Frozen root snapshot at VRF commit time (draft bean created for future hardening)
