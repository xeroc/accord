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
