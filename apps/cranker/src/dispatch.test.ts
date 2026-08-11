/**
 * Dispatch completeness self-check — every CrankKind must register a handler
 * on the factory map, and registration is idempotent-rejecting (duplicate
 * throws). Catches "wrote the crank, forgot to register it" at the same
 * granularity the beans deliver (9 non-draw cranks + draw_seat). Runnable via
 * `node --test` or `bun test`. (ponytail: one check for the one piece of real
 * logic here.)
 */
import { test, expect } from "bun:test";

import { createCrankDispatch } from "./dispatch.js";
import type { CrankKind } from "./types.js";
import { register as registerRequestVrf } from "./cranks/request-vrf.js";
import { register as registerFinalizeRound } from "./cranks/finalize-round.js";
import { register as registerFinalizeDispute } from "./cranks/finalize-dispute.js";
import { register as registerSettleRound } from "./cranks/settle-round.js";
import { register as registerCancelDispute } from "./cranks/cancel-dispute.js";
import { register as registerRedraw } from "./cranks/redraw.js";
import { register as registerExecuteUpdate } from "./cranks/execute-update.js";
import { register as registerExecuteUnpause } from "./cranks/execute-unpause.js";
import { register as registerClaimRefund } from "./cranks/claim-refund.js";
import { register as registerReclaimSlot } from "./cranks/reclaim-slot.js";
import { registerDrawSeatCrank } from "./cranks/draw-seat.js";

const ALL_KINDS: CrankKind[] = [
  "request_vrf",
  "draw_seat",
  "finalize_round",
  "finalize_dispute",
  "settle_round",
  "cancel_dispute",
  "redraw",
  "execute_update",
  "claim_refund",
  "reclaim_slot",
];

/** Build a dispatch with every crank registered — the production wiring. */
function fullDispatch() {
  const d = createCrankDispatch();
  registerRequestVrf(d);
  registerDrawSeatCrank(d);
  registerFinalizeRound(d);
  registerFinalizeDispute(d);
  registerSettleRound(d);
  registerCancelDispute(d);
  registerRedraw(d);
  registerExecuteUpdate(d);
  registerExecuteUnpause(d);
  registerClaimRefund(d);
  registerReclaimSlot(d);
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
  registerRequestVrf(d);
  expect(() => registerRequestVrf(d)).toThrow(/already registered/);
});

test("dispatch: execute returns false for an unregistered kind", async () => {
  const d = createCrankDispatch();
  // An unregistered dispatch + a minimal fake ctx — execute must short-circuit
  // before touching ctx, so the cast is safe.
  const ok = await d.execute(null as never, { kind: "redraw", dispute: null as never });
  expect(ok).toBe(false);
});
