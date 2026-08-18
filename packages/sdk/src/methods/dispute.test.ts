// dispute.test.ts — runnable self-check for the pure domain logic in dispute.ts
// (PDA seeds, fee math, option/evidence/nonce validation, ruling read).
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/sdk test
//
// Kit-dependent paths (findDisputePda / createDispute) are exercised
// by the jest/Surfpool integration suite (bean veridao-7iiv) once the generated
// client + fetchers land; here we cover the deterministic logic that must hold
// regardless of the chain. `getRuling` runs against a stub seam client — it is
// pure orchestration over `AccordDisputeClient`.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "@solana/kit";
import {
  MAX_OPTIONS,
  NO_RULING,
  assertValidEvidenceHash,
  assertValidNonce,
  assertValidOptions,
  disputeSeeds,
  getRuling,
  requiredFee,
  type AccordDisputeClient,
  type DisputeRulingView,
} from "./dispute.ts";
import { Aggregation } from "../types.ts";

const U64_MAX = 0xffffffffffffffffn;

test("disputeSeeds: [b'dispute', filer[32], nonce_le8]", () => {
  const filer = new Uint8Array(32).fill(7);
  const seeds = disputeSeeds(filer, 0n);
  assert.equal(seeds.length, 3);
  assert.deepEqual(Array.from(seeds[0]!), [100, 105, 115, 112, 117, 116, 101]);
  assert.equal(seeds[1]!.length, 32);
  assert.equal(seeds[2]!.length, 8);
  assert.deepEqual(Array.from(seeds[2]!), [0, 0, 0, 0, 0, 0, 0, 0]);

  // nonce little-endian: 1 -> [1,0,...,0]
  const s1 = disputeSeeds(filer, 1n);
  assert.deepEqual(Array.from(s1[2]!), [1, 0, 0, 0, 0, 0, 0, 0]);

  // 0x0102030405060708 -> le bytes
  const sN = disputeSeeds(filer, 0x0102030405060708n);
  assert.deepEqual(Array.from(sN[2]!), [8, 7, 6, 5, 4, 3, 2, 1]);
});

test("requiredFee: min_jury_size · fee_per_juror, null on overflow (accord-9q3e)", () => {
  // Default min_jury_size = 3; fee = 3 · fee_per_juror.
  assert.equal(requiredFee(1_000n), 3_000n);
  assert.equal(requiredFee(0n), 0n);
  // u64 ceiling: (2^64-1) / 3 per juror fits exactly 3x; +1 tips over.
  const per = U64_MAX / 3n;
  assert.equal(requiredFee(per), per * 3n);
  assert.equal(requiredFee(per + 1n), null); // overflow
  assert.equal(requiredFee(-1n), null); // negative fee
  // accord-9q3e: N=1 pool → fee = 1 · fee_per_juror.
  assert.equal(requiredFee(1_000n, 1), 1_000n);
  assert.equal(requiredFee(1_000n, 5), 5_000n);
  assert.equal(requiredFee(1_000n, 0), null); // invalid min_jury_size
});

test("assertValidOptions: Plurality 2..=MAX_OPTIONS x 32B; Median none (ADR-0025)", () => {
  const h = () => new Uint8Array(32);
  assertValidOptions([h(), h()]); // 2 ok (default = Plurality)
  assertValidOptions([h(), h()], Aggregation.Plurality);
  assertValidOptions(Array.from({ length: MAX_OPTIONS }, h)); // max ok
  assert.throws(() => assertValidOptions([h()]), /InvalidOptions/); // 1
  assert.throws(
    () => assertValidOptions(Array.from({ length: MAX_OPTIONS + 1 }, h)),
    /InvalidOptions/,
  ); // 9
  assert.throws(
    () => assertValidOptions([new Uint8Array(31), h()]),
    /32 bytes/,
  );
  // Median (scalar) disputes file without option hashes (create_dispute.rs).
  assertValidOptions([], Aggregation.Median);
  assert.throws(() => assertValidOptions([h()], Aggregation.Median), /Median/);
});

test("getRuling: u64::MAX sentinel → null, real ruling → bigint (ADR-0025)", async () => {
  const stub = (view: DisputeRulingView | null): AccordDisputeClient => ({
    buildCreateDispute: () => {
      throw new Error("unused in this test");
    },
    fetchDispute: async () => view,
  });
  const addr = "11111111111111111111111111111111" as Address;
  // Account does not exist yet → null.
  assert.equal(await getRuling(stub(null), addr), null);
  // No ruling yet → null. The adapter folds the u64::MAX sentinel (was
  // u8::MAX/255 pre-ADR-0025) when building the view; `getRuling` also folds
  // defensively (on-chain `Dispute::ruling()` posture), so a seam that leaks
  // the sentinel still yields null.
  assert.equal(NO_RULING, 0xffff_ffff_ffff_ffffn);
  assert.equal(await getRuling(stub({ finalRuling: null }), addr), null);
  assert.equal(await getRuling(stub({ finalRuling: NO_RULING }), addr), null);
  // Plurality: option index; Median: scalar in settlement-mint base units.
  assert.equal(await getRuling(stub({ finalRuling: 2n }), addr), 2n);
  assert.equal(
    await getRuling(stub({ finalRuling: 123_450_000n }), addr),
    123_450_000n,
  );
});

test("assertValidEvidenceHash: exactly 32 bytes", () => {
  assertValidEvidenceHash(new Uint8Array(32));
  assert.throws(() => assertValidEvidenceHash(new Uint8Array(31)), /32 bytes/);
  assert.throws(() => assertValidEvidenceHash(new Uint8Array(33)), /32 bytes/);
});

test("assertValidNonce: u64 range", () => {
  assertValidNonce(0n);
  assertValidNonce(U64_MAX);
  assert.throws(() => assertValidNonce(-1n), /u64/);
  assert.throws(() => assertValidNonce(U64_MAX + 1n), /u64/);
});
