/**
 * format.test.ts — checks the `formatRuling` plaintext-label override
 * (encoded value ↔ manifest label resolution used by DisputeDetail).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { Aggregation, NO_RULING } from "@useaccord/sdk";
import { formatRuling } from "./format";

test("formatRuling: manifest label wins over encoded Option N", () => {
  assert.equal(
    formatRuling(1n, Aggregation.Plurality, ["Refund buyer", "Escalate"]),
    "Escalate",
  );
});

test("formatRuling: falls back to Option N when label missing or blank", () => {
  assert.equal(formatRuling(1n, Aggregation.Plurality, ["Refund"]), "Option 1");
  assert.equal(formatRuling(0n, Aggregation.Plurality, ["  "]), "Option 0");
  assert.equal(formatRuling(2n, Aggregation.Plurality), "Option 2");
});

test("formatRuling: labels never apply to Median scalars / no-ruling", () => {
  assert.equal(formatRuling(NO_RULING, Aggregation.Median, ["a", "b"]), "—");
});
