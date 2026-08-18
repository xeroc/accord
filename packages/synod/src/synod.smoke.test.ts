// synod.smoke.test.ts — runnable self-check for the Synod SDK facade.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/synod test
//
// The instruction facades (openCase, join, …) are type-checked by the tsc
// build (if they compile against the generated IDL, the instruction shapes
// are valid) and exercised end-to-end by the Surfpool jest suite. Here we
// cover the deterministic PDA/ATA logic — the part that must hold regardless
// of the chain. Mirrors canon.smoke.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";

import { findAssociatedTokenAddress } from "@useaccord/sdk";

import {
  SDK_NAME,
  SYNOD_PROGRAM_ADDRESS,
  findSynodCasePda,
  findCaseVaultPda,
} from "../dist/index.js";

const DUMMY = "11111111111111111111111111111111";

test("SYNOD_PROGRAM_ADDRESS: generated client matches declare_id", () => {
  // Canonical keypair (programs/synod/src/lib.rs → target/idl/synod.json →
  // src/generated) — provisioned by the accord-8ymx drill.
  assert.equal(SYNOD_PROGRAM_ADDRESS, "GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC");
  assert.equal(SDK_NAME, "@useaccord/synod");
});

test("findSynodCasePda: deterministic, seeds [b'case', opener, nonce]", async () => {
  const [addr, bump] = await findSynodCasePda({ opener: DUMMY, nonce: 0n });

  // Deterministic: same inputs → same output.
  const [addr2] = await findSynodCasePda({ opener: DUMMY, nonce: 0n });
  assert.equal(addr, addr2);

  // Bump is a u8.
  assert.ok(bump >= 0 && bump <= 255);

  // Different nonce → different PDA (case disambiguator).
  const [addr3] = await findSynodCasePda({ opener: DUMMY, nonce: 1n });
  assert.notEqual(addr, addr3);

  // Different opener → different PDA.
  const [addr4] = await findSynodCasePda({
    opener: "SysvarRent111111111111111111111111111111111",
    nonce: 0n,
  });
  assert.notEqual(addr, addr4);
});

test("findCaseVaultPda: adapter over the Accord SDK ATA derivation", async () => {
  const MINT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const [casePda] = await findSynodCasePda({ opener: DUMMY, nonce: 7n });

  // The helper IS findAssociatedTokenAddress(mint, casePda) — single source.
  assert.equal(
    await findCaseVaultPda(MINT, casePda),
    await findAssociatedTokenAddress(MINT, casePda),
  );

  // Deterministic; different mint → different vault.
  assert.equal(
    await findCaseVaultPda(MINT, casePda),
    await findCaseVaultPda(MINT, casePda),
  );
  assert.notEqual(
    await findCaseVaultPda(MINT, casePda),
    await findCaseVaultPda(DUMMY, casePda),
  );
});
