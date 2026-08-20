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
import { address } from "@solana/kit";

import {
  SDK_NAME,
  SYNOD_PROGRAM_ADDRESS,
  findCasePda,
  findSynodCasePda,
  findCaseVaultPda,
} from "../dist/index.js";

const DUMMY = "11111111111111111111111111111111";

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
    opener: address(DUMMY),
    nonce: 0n,
  });
  // A PDA of the synod program is 32 bytes (base58, non-default) — smoke-level
  // check that derivation is wired, not off-curve.
  assert.notEqual(pda, DUMMY);
});

test("findSynodCasePda: alias of findCasePda, deterministic seeds", async () => {
  const [alias] = await findSynodCasePda({ opener: DUMMY, nonce: 0n });
  const [direct] = await findCasePda({ opener: address(DUMMY), nonce: 0n });
  assert.equal(alias, direct);

  // Different nonce → different PDA (case disambiguator).
  const [otherNonce] = await findSynodCasePda({ opener: DUMMY, nonce: 1n });
  assert.notEqual(alias, otherNonce);

  // Different opener → different PDA.
  const [otherOpener] = await findSynodCasePda({
    opener: "SysvarRent111111111111111111111111111111111",
    nonce: 0n,
  });
  assert.notEqual(alias, otherOpener);
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
