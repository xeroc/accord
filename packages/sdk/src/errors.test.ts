// errors.test.ts — pins the hand-maintained AccordErrors map to the
// Codama-generated error constants (regenerated from the IDL on every
// `make codegen`). The map drifted 4 variants short in the staking block,
// silently renaming every later error code (6027 InvalidPanelSize was
// reported as "CommitAlreadyExists" — verified on devnet 2026-10-12).
// Excluded from the build; run via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";

import { AccordErrors } from "./errors.ts";
import * as generated from "./generated/errors/accord.ts";

test("AccordErrors codes match the generated (IDL-derived) constants exactly", () => {
  const genEntries = Object.entries(generated).filter(
    ([k, v]) => k.startsWith("ACCORD_ERROR__") && typeof v === "number",
  );
  assert.ok(genEntries.length >= 50, `expected the full error set, got ${genEntries.length}`);

  const byCode = new Map<number, string>();
  for (const entry of Object.values(AccordErrors)) {
    const e = entry as { code: number; name: string };
    assert.ok(!byCode.has(e.code), `duplicate code ${e.code} in AccordErrors`);
    byCode.set(e.code, e.name);
  }

  const mismatches: string[] = [];
  for (const [key, code] of genEntries) {
    const name = key
      .replace(/^ACCORD_ERROR__/, "")
      .toLowerCase()
      .replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    // The IDL camelCases some names (alreadyPaused) vs the enum (AlreadyPaused).
    const normalize = (v: string) => v.charAt(0).toLowerCase() + v.slice(1);
    const ours = byCode.get(code as number);
    if (ours !== name && normalize(ours ?? "") !== name) {
      mismatches.push(`code ${code}: map says ${ours ?? "<missing>"}, IDL says ${name}`);
    }
  }
  assert.deepEqual(mismatches, [], "hand map drifted from the IDL");
});

test("the devnet-verified pair: 6027 InvalidPanelSize, 6057 AttestationMissing", () => {
  assert.equal(AccordErrors.InvalidPanelSize.code, 6027);
  assert.equal(AccordErrors.AttestationMissing.code, 6057);
});
