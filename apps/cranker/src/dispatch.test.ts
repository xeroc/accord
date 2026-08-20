/**
 * Dispatch completeness self-check — every CrankKind must register a handler
 * on the factory map, and registration is idempotent-rejecting (duplicate
 * throws). Catches "wrote the crank, forgot to register it" at the same
 * granularity the beans deliver (11 Accord + 3 Canon + 3 Synod cranks).
 * Runnable
 * via `node --test` or `bun test`. (ponytail: one check for the one piece of
 * real logic here.)
 */
import { test, expect } from "bun:test";

import { createCrankDispatch } from "./dispatch.js";
import type { CrankKind } from "./types.js";
import { register as registerAccordRequestVrf } from "./cranks/accord/request-vrf.js";
import { registerDrawSeatCrank as registerAccordDrawSeat } from "./cranks/accord/draw-seat.js";
import { register as registerAccordFinalizeRound } from "./cranks/accord/finalize-round.js";
import { register as registerAccordFinalizeDispute } from "./cranks/accord/finalize-dispute.js";
import { register as registerAccordSettleRound } from "./cranks/accord/settle-round.js";
import { register as registerAccordCancelDispute } from "./cranks/accord/cancel-dispute.js";
import { register as registerAccordRedraw } from "./cranks/accord/redraw.js";
import { register as registerAccordExecuteUpdate } from "./cranks/accord/execute-update.js";
import { register as registerAccordExecuteUnpause } from "./cranks/accord/execute-unpause.js";
import { register as registerAccordClaimRefund } from "./cranks/accord/claim-refund.js";
import { register as registerAccordReclaimSlot } from "./cranks/accord/reclaim-slot.js";
import { register as registerCanonAdvancePending } from "./cranks/canon/advance-pending.js";
import { register as registerCanonSettleItem } from "./cranks/canon/settle-item.js";
import { register as registerCanonAdvanceWithdrawal } from "./cranks/canon/advance-withdrawal.js";
import { register as registerCanonCloseItem } from "./cranks/canon/close-item.js";
import { register as registerSynodFileDispute } from "./cranks/synod/file-dispute.js";
import { register as registerSynodClaim } from "./cranks/synod/claim.js";
import { register as registerSynodRefundRosterMiss } from "./cranks/synod/refund-roster-miss.js";

const ALL_KINDS: CrankKind[] = [
  "request_vrf",
  "draw_seat",
  "finalize_round",
  "finalize_dispute",
  "settle_round",
  "cancel_dispute",
  "redraw",
  "execute_update",
  "execute_unpause",
  "claim_refund",
  "reclaim_slot",
  "canon_advance_pending",
  "canon_settle_item",
  "canon_advance_withdrawal",
  "canon_close_item",
  "synod_file_dispute",
  "synod_refund_roster_miss",
  "synod_claim",
];

/** Build a dispatch with every crank registered — the production wiring. */
function fullDispatch() {
  const d = createCrankDispatch();
  registerAccordRequestVrf(d);
  registerAccordDrawSeat(d);
  registerAccordFinalizeRound(d);
  registerAccordFinalizeDispute(d);
  registerAccordSettleRound(d);
  registerAccordCancelDispute(d);
  registerAccordRedraw(d);
  registerAccordExecuteUpdate(d);
  registerAccordExecuteUnpause(d);
  registerAccordReclaimSlot(d);
  registerAccordClaimRefund(d);
  registerCanonAdvancePending(d);
  registerCanonSettleItem(d);
  registerCanonAdvanceWithdrawal(d);
  registerCanonCloseItem(d);
  registerSynodFileDispute(d);
  registerSynodRefundRosterMiss(d);
  registerSynodClaim(d);
  return d;
}

test("dispatch: every CrankKind has a registered handler", () => {
  const d = fullDispatch();
  for (const kind of ALL_KINDS) {
    expect(d.has(kind)).toBe(true);
  }
});

test("dispatch: no kind is registered twice (duplicate registration throws)", () => {
  const d = createCrankDispatch();
  registerAccordRequestVrf(d);
  expect(() => registerAccordRequestVrf(d)).toThrow(/already registered/);
});

test("dispatch: execute returns false for an unregistered kind", async () => {
  const d = createCrankDispatch();
  // An unregistered dispatch + a minimal fake ctx — execute must short-circuit
  // before touching ctx, so the cast is safe.
  const ok = await d.execute(null as never, { kind: "redraw", dispute: null as never });
  expect(ok).toBe(false);
});

test("dispatch: concurrent duplicate actions run the handler once (listener + poll converge)", async () => {
  // The canon GC WS listener and the 60s reconciler sweep can resolve the
  // same Removed item at the same time (bean accord-m5fd); the in-flight
  // dedup absorbs the second execute instead of double-sending.
  const d = createCrankDispatch();
  let runs = 0;
  const { promise: firstStarted, resolve: signalStarted } = Promise.withResolvers<void>();
  const { promise: release, resolve: signalRelease } = Promise.withResolvers<void>();
  d.register("canon_close_item", async () => {
    runs += 1;
    signalStarted();
    await release; // hold the first execution "in flight"
  });
  const action = {
    kind: "canon_close_item",
    item: "Item111111111111111111111111111111111111111",
  } as never;
  const p1 = d.execute(null as never, action);
  await firstStarted;
  const p2 = d.execute(null as never, action); // absorbed: same kind+subject in flight
  const ok2 = await p2;
  expect(ok2).toBe(true);
  signalRelease();
  await p1;
  expect(runs).toBe(1);
  // Key released on completion → a later trigger dispatches again (retry).
  await d.execute(null as never, action);
  expect(runs).toBe(2);
});
