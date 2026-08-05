// voting.test.ts — runnable self-check for the client-side commit hash + voting
// helpers. The commit hash is the load-bearing crypto (a byte-order or length
// mistake silently breaks every dispute), so it is pinned to a hardcoded
// digest vector computed independently of this module.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @accord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_VOTE,
  assertValidSalt,
  assertValidVote,
  commitHash,
  roundSeeds,
} from "./voting.ts";

// Reference vector, computed with node:crypto (SHA-256), independent of voting.ts:
//   sha256( 0x01 || salt=0x01*32 || juror=0x02*32 )
//   => b331da6ec49d4547d9942a6727e5123f69bed5a0b97ac171cfbfd6201431fcfa
const SALT = new Uint8Array(32).fill(0x01);
const JUROR = new Uint8Array(32).fill(0x02);
const EXPECTED_COMMIT_V1 =
  "b331da6ec49d4547d9942a6727e5123f69bed5a0b97ac171cfbfd6201431fcfa";

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

test("commitHash: matches on-chain hashv(vote | salt | juror) — known vector", async () => {
  const h = await commitHash(1, SALT, JUROR);
  assert.equal(h.length, 32);
  assert.equal(toHex(h), EXPECTED_COMMIT_V1);
});

test("commitHash: differs when any preimage field changes", async () => {
  const base = toHex(await commitHash(1, SALT, JUROR));
  // vote changes
  assert.notEqual(toHex(await commitHash(2, SALT, JUROR)), base);
  // salt changes
  const salt2 = new Uint8Array(32).fill(0x03);
  assert.notEqual(toHex(await commitHash(1, salt2, JUROR)), base);
  // juror changes
  const juror2 = new Uint8Array(32).fill(0x04);
  assert.notEqual(toHex(await commitHash(1, SALT, juror2)), base);
});

test("commitHash: validates vote / salt / juror lengths", async () => {
  await assert.rejects(() => commitHash(-1, SALT, JUROR), /InvalidVote/);
  await assert.rejects(() => commitHash(256, SALT, JUROR), /InvalidVote/);
  await assert.rejects(
    () => commitHash(1, new Uint8Array(31), JUROR),
    /InvalidSalt/,
  );
  await assert.rejects(
    () => commitHash(1, SALT, new Uint8Array(33)),
    /InvalidJuror/,
  );
});

test("assertValidVote: 0..numOptions (exclusive)", () => {
  assertValidVote(0, 2);
  assertValidVote(1, 2);
  assert.throws(() => assertValidVote(2, 2), /InvalidVote/);
  assert.throws(() => assertValidVote(-1, 2), /InvalidVote/);
  assert.throws(() => assertValidVote(1.5, 2), /InvalidVote/);
});

test("assertValidSalt: exactly 32 bytes", () => {
  assertValidSalt(new Uint8Array(32));
  assert.throws(() => assertValidSalt(new Uint8Array(31)), /InvalidSalt/);
});

test("roundSeeds: [b'round', dispute[32], roundIdx_le4]", () => {
  const dispute = new Uint8Array(32).fill(0x09);
  const seeds = roundSeeds(dispute, 0);
  assert.equal(seeds.length, 3);
  assert.deepEqual(Array.from(seeds[0]!), [114, 111, 117, 110, 100]); // "round"
  assert.equal(seeds[1]!.length, 32);
  assert.equal(seeds[2]!.length, 4);
  assert.deepEqual(Array.from(seeds[2]!), [0, 0, 0, 0]);

  // u32 little-endian: 0x01020304 -> [4,3,2,1]
  const s = roundSeeds(dispute, 0x01020304);
  assert.deepEqual(Array.from(s[2]!), [4, 3, 2, 1]);

  // out of u32 range
  assert.throws(() => roundSeeds(dispute, -1), /InvalidRoundIdx/);
  assert.throws(() => roundSeeds(dispute, 0x100000000), /InvalidRoundIdx/);
});

test("NO_VOTE sentinel is u8::MAX", () => {
  assert.equal(NO_VOTE, 0xff);
});
