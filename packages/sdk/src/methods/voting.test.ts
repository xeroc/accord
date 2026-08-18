// voting.test.ts — runnable self-check for the client-side commit hash + voting
// helpers. The commit hash is the load-bearing crypto (a byte-order or length
// mistake silently breaks every dispute), so it is pinned to a hardcoded
// digest vector computed independently of this module.
//
// Scalar votes (ADR-0025): votes are u64 on the wire; the commit preimage is
// the vote's 8-byte little-endian encoding ‖ salt[32] ‖ juror[32] = 72 bytes.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Address } from "@solana/kit";
import {
  NO_VOTE,
  type AccordVotingClient,
  type VotingAccounts,
  assertValidSalt,
  assertValidVote,
  commitHash,
  decodeScalarVote,
  encodeScalarVote,
  reveal,
  roundSeeds,
} from "./voting.ts";

// Reference vector, computed with node:crypto (SHA-256), independent of voting.ts:
//   sha256( vote=1n as 8-byte LE (01 00..00) || salt=0x01*32 || juror=0x02*32 )
//   => 9b20b90126bf0bb4819d4fcbe4d57777f61953a78b4d8753ccec94ea2b676828
const SALT = new Uint8Array(32).fill(0x01);
const JUROR = new Uint8Array(32).fill(0x02);
const EXPECTED_COMMIT_V2 =
  "9b20b90126bf0bb4819d4fcbe4d57777f61953a78b4d8753ccec94ea2b676828";

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const voteLe = (vote: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(vote);
  return b;
};

test("commitHash: matches on-chain hashv(vote_le | salt | juror) — known vector", async () => {
  const h = await commitHash(1n, SALT, JUROR);
  assert.equal(h.length, 32);
  assert.equal(toHex(h), EXPECTED_COMMIT_V2);
});

test("commitHash: preimage is 72 bytes — u64 LE vote ‖ salt[32] ‖ juror[32]", () => {
  const preimage = Buffer.concat([voteLe(1n), SALT, JUROR]);
  assert.equal(preimage.length, 72); // 8 + 32 + 32 (ADR-0025)
  const digest = createHash("sha256").update(preimage).digest("hex");
  assert.equal(digest, EXPECTED_COMMIT_V2);
});

test("commitHash: differs when any preimage field changes", async () => {
  const base = toHex(await commitHash(1n, SALT, JUROR));
  // vote changes
  assert.notEqual(toHex(await commitHash(2n, SALT, JUROR)), base);
  assert.notEqual(toHex(await commitHash(0n, SALT, JUROR)), base);
  // vote above u32 range: proves the LE encoding is 8 bytes wide, not 1/4
  assert.notEqual(toHex(await commitHash(0x1_0000_0000n, SALT, JUROR)), base);
  // salt changes
  const salt2 = new Uint8Array(32).fill(0x03);
  assert.notEqual(toHex(await commitHash(1n, salt2, JUROR)), base);
  // juror changes
  const juror2 = new Uint8Array(32).fill(0x04);
  assert.notEqual(toHex(await commitHash(1n, SALT, juror2)), base);
});

test("commitHash: validates vote / salt / juror", async () => {
  await assert.rejects(() => commitHash(-1n, SALT, JUROR), /InvalidVote/);
  await assert.rejects(() => commitHash(2n ** 64n, SALT, JUROR), /InvalidVote/);
  // non-bigint (a stale number call site) must fail loudly, not coerce
  await assert.rejects(
    () => commitHash(1 as unknown as bigint, SALT, JUROR),
    /InvalidVote/,
  );
  await assert.rejects(
    () => commitHash(1n, new Uint8Array(31), JUROR),
    /InvalidSalt/,
  );
  await assert.rejects(
    () => commitHash(1n, SALT, new Uint8Array(33)),
    /InvalidJuror/,
  );
});

test("NO_VOTE sentinel is u64::MAX", () => {
  assert.equal(NO_VOTE, 0xffff_ffff_ffff_ffffn);
  assert.equal(NO_VOTE, 2n ** 64n - 1n);
});

test("assertValidVote: 0..numOptions (exclusive, bigint)", () => {
  assertValidVote(0n, 2);
  assertValidVote(1n, 2);
  assert.throws(() => assertValidVote(2n, 2), /InvalidVote/);
  assert.throws(() => assertValidVote(-1n, 2), /InvalidVote/);
});

test("assertValidSalt: exactly 32 bytes", () => {
  assertValidSalt(new Uint8Array(32));
  assert.throws(() => assertValidSalt(new Uint8Array(31)), /InvalidSalt/);
});

test("reveal facade: rejects sentinel / out-of-u64 votes, passes bigint through", () => {
  let built: { vote: bigint } | undefined;
  const client = {
    buildReveal: (input: { vote: bigint }) => {
      built = input;
    },
  } as unknown as AccordVotingClient;
  const programId = "11111111111111111111111111111111" as Address;
  const accounts = {
    signer: "11111111111111111111111111111111" as Address,
    subaccord: "11111111111111111111111111111111" as Address,
    dispute: "11111111111111111111111111111111" as Address,
    round: "11111111111111111111111111111111" as Address,
  } as VotingAccounts;
  assert.throws(
    () => reveal(client, programId, accounts, { vote: NO_VOTE, salt: SALT }),
    /InvalidVote/,
  );
  assert.throws(
    () => reveal(client, programId, accounts, { vote: 2n ** 64n, salt: SALT }),
    /InvalidVote/,
  );
  reveal(client, programId, accounts, { vote: 123450000n, salt: SALT });
  assert.equal(built?.vote, 123450000n);
});

test("encodeScalarVote: scales by 10^decimals", () => {
  assert.equal(encodeScalarVote("123.45"), 123450000n); // 6 decimals
  assert.equal(encodeScalarVote("123"), 123000000n);
  assert.equal(encodeScalarVote("0.000001"), 1n);
  assert.equal(encodeScalarVote("0"), 0n);
  assert.equal(encodeScalarVote("1.5", 1), 15n);
  assert.equal(encodeScalarVote("1.5", 18), 1_500_000_000_000_000_000n);
  assert.equal(encodeScalarVote("1.23", 2), 123n); // exact-boundary fraction
});

test("encodeScalarVote: rejects malformed input", () => {
  assert.throws(() => encodeScalarVote(""), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote("-1"), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote("+1"), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote("1.2345678"), /InvalidScalarVote/); // 7 > 6 digits
  assert.throws(() => encodeScalarVote("1.234", 2), /InvalidScalarVote/); // 3 > 2 digits
  assert.throws(() => encodeScalarVote("abc"), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote("1.2.3"), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote("1e3"), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote(" 1"), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote("1,5"), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote("1."), /InvalidScalarVote/);
  assert.throws(() => encodeScalarVote(".5"), /InvalidScalarVote/);
});

test("decodeScalarVote: plain decimal, trailing zeros trimmed", () => {
  assert.equal(decodeScalarVote(123450000n), "123.45");
  assert.equal(decodeScalarVote(123000000n), "123");
  assert.equal(decodeScalarVote(1n), "0.000001");
  assert.equal(decodeScalarVote(0n), "0");
  assert.equal(decodeScalarVote(15n, 1), "1.5");
  assert.equal(decodeScalarVote(1_500_000_000_000_000_000n, 18), "1.5");
  assert.equal(decodeScalarVote(5n, 0), "5");
  assert.throws(() => decodeScalarVote(-1n), /InvalidScalarVote/);
});

test("encodeScalarVote/decodeScalarVote roundtrip", () => {
  for (const s of ["0", "1", "123", "123.45", "0.000001", "999999.999999"]) {
    assert.equal(decodeScalarVote(encodeScalarVote(s)), s, s);
  }
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
