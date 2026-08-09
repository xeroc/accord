/**
 * Dispatch completeness self-check — every CrankKind must route to an
 * executor. Catches "wrote the crank, forgot to register it" at the same
 * granularity the bean delivers (9 cranks). Runnable via `node --test` or
 * `bun test`. (ponytail: one check for the one piece of real logic here.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CRANK_DISPATCH } from "./dispatch.js";
import type { CrankKind } from "./types.js";

const ALL_KINDS: CrankKind[] = [
  "request_vrf",
  "finalize_round",
  "finalize_dispute",
  "settle_round",
  "cancel_dispute",
  "redraw",
  "execute_update",
  "execute_unpause",
  "claim_refund",
];

test("dispatch: every CrankKind has a registered executor", () => {
  for (const kind of ALL_KINDS) {
    assert.equal(
      typeof CRANK_DISPATCH[kind],
      "function",
      `no executor registered for crank "${kind}"`,
    );
  }
});

test("dispatch: exactly the nine non-draw cranks are registered", () => {
  assert.equal(new Set(Object.keys(CRANK_DISPATCH)).size, ALL_KINDS.length);
  assert.deepEqual([...ALL_KINDS].sort(), Object.keys(CRANK_DISPATCH).sort());
});
