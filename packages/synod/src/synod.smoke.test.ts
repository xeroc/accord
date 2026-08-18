// synod.smoke.test.ts — runnable self-check for the Synod SDK codegen wiring.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/synod test
//
// The hand-written facade (pda helpers, methods, fetchers) and its PDA tests
// land with the facade bean (mirrors canon.smoke.test.ts). Until then the one
// invariant that must hold regardless of the chain: the generated Codama
// client is bound to the Synod program declared in the on-chain crate
// (`declare_id!` in programs/synod/src/lib.rs → target/idl/synod.json →
// src/generated).
import { test } from "node:test";
import assert from "node:assert/strict";

import { SDK_NAME, SYNOD_PROGRAM_ADDRESS } from "../dist/index.js";

test("SYNOD_PROGRAM_ADDRESS: generated client matches declare_id", () => {
  // Placeholder scaffold keypair (programs/synod/src/lib.rs) — regenerate +
  // swap for the canonical keypair before first deploy.
  assert.equal(SYNOD_PROGRAM_ADDRESS, "5o5VDoAZJFTJaBKJjhPMLMMPa8nmqgZdSkUFubNdAxZx");
  assert.equal(SDK_NAME, "@useaccord/synod");
});
