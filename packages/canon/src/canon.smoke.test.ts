// canon.smoke.test.ts — runnable self-check for the Canon SDK PDA helpers.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/canon test
//
// The instruction facades (submitItem, advancePending, …) are type-checked by
// the tsc build (if they compile against the generated IDL, the instruction
// shapes are valid) and exercised end-to-end by the Surfpool jest suite
// (bean accord-f5xg). Here we cover the deterministic PDA logic — the part
// that must hold regardless of the chain.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findCanonListPda,
  findCanonItemPda,
  CANON_PROGRAM_ID,
  defaultCourtParams,
} from "../dist/index.js";

const DUMMY = "11111111111111111111111111111111";

test("findCanonListPda: deterministic, seeds [b'canon', creator, rules_hash]", async () => {
  const rulesHash = new Uint8Array(32).fill(0xab);
  const [addr, bump] = await findCanonListPda({
    creator: DUMMY,
    rulesHash,
  });

  // Deterministic: same inputs → same output.
  const [addr2] = await findCanonListPda({
    creator: DUMMY,
    rulesHash,
  });
  assert.equal(addr, addr2);

  // Bump is a u8.
  assert.ok(bump >= 0 && bump <= 255);

  // Different rules_hash → different PDA.
  const [addr3] = await findCanonListPda({
    creator: DUMMY,
    rulesHash: new Uint8Array(32).fill(0xcd),
  });
  assert.notEqual(addr, addr3);

  // Different creator → different PDA.
  const [addr4] = await findCanonListPda({
    creator: "SysvarRent111111111111111111111111111111111",
    rulesHash,
  });
  assert.notEqual(addr, addr4);
});

test("defaultCourtParams: canonical profile (ADR canon/0002)", () => {
  const p = defaultCourtParams();
  assert.equal(p.minStake, 1_000n);
  assert.equal(p.alphaBps, 1_000);
  assert.equal(p.reviewWindow, 604_800n);
  assert.equal(p.commitWindow, 172_800n);
  assert.equal(p.revealWindow, 172_800n);
  assert.equal(p.appealWindow, 259_200n);
  assert.equal(p.maxAppeals, 3);
  assert.equal(p.minJurySize, 3);
  assert.equal(p.feePerJuror, 10n);
  assert.equal(p.revealThresholdBps, 6_666);
  assert.equal(p.maxDrawAttempts, 3);
  assert.equal(p.depth, 8);
  // fresh object per call — callers may spread-and-override safely
  assert.notEqual(defaultCourtParams(), p);
});

test("findCanonItemPda: deterministic, seeds [b'canon-item', list, account]", async () => {
  const list = DUMMY;
  const account = "SysvarRent111111111111111111111111111111111";
  const [addr, bump] = await findCanonItemPda(list, account);

  const [addr2] = await findCanonItemPda(list, account);
  assert.equal(addr, addr2);
  assert.ok(bump >= 0 && bump <= 255);

  // Different account → different PDA.
  const [addr3] = await findCanonItemPda(list, DUMMY);
  assert.notEqual(addr, addr3);
});
