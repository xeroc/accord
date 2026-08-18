// synod.smoke.test.ts — runnable self-check for the Synod SDK codegen wiring.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/synod test
//
// The invariant that must hold regardless of the chain: the generated Codama
// client is bound to the Synod program declared in the on-chain crate
// (`declare_id!` in programs/synod/src/lib.rs → target/idl/synod.json →
// src/generated).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SDK_NAME,
  SYNOD_PROGRAM_ADDRESS,
  findCasePda,
} from "../dist/index.js";
import { address } from "@solana/kit";

test("SYNOD_PROGRAM_ADDRESS: generated client matches declare_id", () => {
  // Canonical keypair (bean accord-8ymx) — programs/synod/src/lib.rs.
  assert.equal(
    SYNOD_PROGRAM_ADDRESS,
    "GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC",
  );
  assert.equal(SDK_NAME, "@useaccord/synod");
});

test("findCasePda derives on the canonical program", async () => {
  const [pda] = await findCasePda({
    opener: address("11111111111111111111111111111111"),
    nonce: 0n,
  });
  // A PDA of the synod program is 32 bytes (base58, non-default) — smoke-level
  // check that derivation is wired, not off-curve.
  assert.notEqual(pda, "11111111111111111111111111111111");
});
