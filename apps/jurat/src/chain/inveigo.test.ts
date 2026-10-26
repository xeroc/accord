// inveigo.test.ts — unit contract for the Inveigo case resolver (read_case
// backing): fixed-offset decode of the inveigo `Item` account (borsh mirror
// of programs/inveigo/src/state.rs, drift-pinned by that repo's tests.rs),
// dispute→item getProgramAccounts resolution, and the sha256-verified thesis
// fetch from the evidence CAS.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getAddressEncoder, getBase58Decoder, type Address } from "@solana/kit";

import {
  INVEIGO_PROGRAM_ID,
  InveigoCaseError,
  ITEM_DATA_LEN,
  decodeItemView,
  readInveigoCase,
} from "./inveigo.js";

const addr = getAddressEncoder();

// Valid base58 Addresses derived from distinct 32-byte patterns (hand-typed
// strings fail kit's 32-byte length check — base58 length ≠ byte length).
const CREATOR = getBase58Decoder().decode(new Uint8Array(32).fill(1));
const MINT = getBase58Decoder().decode(new Uint8Array(32).fill(2));
const SUBACCORD = getBase58Decoder().decode(new Uint8Array(32).fill(3));
const DISPUTE = getBase58Decoder().decode(new Uint8Array(32).fill(4));
const CHALLENGER = getBase58Decoder().decode(new Uint8Array(32).fill(5));
const OTHER_COURT = getBase58Decoder().decode(new Uint8Array(32).fill(9));

const THESIS = "---\nkind: inveigo-thesis-v1\n---\n\nThe boss thesis.";
const THESIS_BYTES = new TextEncoder().encode(THESIS);
// The fixture Item commits sha256(THESIS) — exactly what the CAS fetch must return.
const CLAIM_HASH = createHash("sha256").update(THESIS_BYTES).digest();
const CLAIM_HASH_HEX = Array.from(CLAIM_HASH, (b) => b.toString(16).padStart(2, "0")).join("");

/** Build the 249-byte on-chain Item layout (discriminator + borsh fields). */
function itemBytes(): Uint8Array {
  const bytes = new Uint8Array(ITEM_DATA_LEN);
  const view = new DataView(bytes.buffer);
  bytes.set([92, 157, 163, 130, 72, 254, 86, 216], 0); // discriminator
  bytes.set(addr.encode(CREATOR), 8); // creator
  view.setBigUint64(40, 7n, true); // nonce
  bytes.set(CLAIM_HASH, 48); // claim_hash
  view.setBigUint64(80, 11n, true); // seed
  view.setBigUint64(88, 13n, true); // pot
  bytes.set([0], 96); // flip_outcome = Terminal
  view.setBigInt64(97, 17n, true); // expires_at
  bytes.set(addr.encode(SUBACCORD), 105); // subaccord
  bytes.set([1], 137); // state = Challenging
  bytes.set(addr.encode(DISPUTE), 138); // current_dispute
  bytes.set(addr.encode(CHALLENGER), 170); // challenger
  view.setUint32(202, 3, true); // defense_count
  bytes.set(addr.encode(MINT), 206); // mint
  view.setUint16(238, 1000, true); // creator_share_bps
  bytes.set([255], 240); // bump
  view.setBigInt64(241, 60n, true); // challenge_window_secs
  return bytes;
}

interface GpaResult {
  pubkey: string;
  account: {
    data: [string, "base64"];
    executable: boolean;
    lamports: bigint;
    owner: string;
    rentEpoch: bigint;
  };
}

/** The gPA wire config readInveigoCase must send (discriminator + dispute memcmps). */
interface GpaCallConfig {
  encoding: string;
  filters: Array<{ memcmp: { offset: bigint; bytes: string; encoding: string } }>;
}

/** Stub `Rpc<GetProgramAccountsApi>` returning canned results, capturing wire calls. */
function stubRpc(results: GpaResult[]) {
  const calls: Array<{ program: unknown; config: GpaCallConfig }> = [];
  const rpc = {
    calls,
    getProgramAccounts: (program: unknown, config: GpaCallConfig) => {
      calls.push({ program, config });
      return { send: async () => results };
    },
  };
  return rpc as never;
}

function gpaResult(
  bytes: Uint8Array,
  pubkey = "Iteaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
): GpaResult {
  return {
    pubkey,
    account: {
      data: [Buffer.from(bytes).toString("base64"), "base64"],
      executable: false,
      lamports: 0n,
      owner: INVEIGO_PROGRAM_ID,
      rentEpoch: 0n,
    },
  };
}

/** Patch globalThis.fetch with route tables: string URL → status + bytes. */
function stubFetch(routes: Record<string, { status: number; bytes?: Uint8Array }>) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (route) {
      return new Response(route.bytes ?? new Uint8Array(0), { status: route.status });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { calls, close: () => (globalThis.fetch = original) };
}

const ENDPOINT = "http://evidence.invalid";

test("readInveigoCase: gPA scan targets inveigo, filters discriminator@0 + dispute@138", async () => {
  const cas = stubFetch({});
  try {
    const rpc = stubRpc([gpaResult(itemBytes())]);
    await readInveigoCase({ rpc, endpoint: ENDPOINT, dispute: DISPUTE });
    const [call] = rpc.calls;
    assert.ok(call);
    assert.equal(call.program, INVEIGO_PROGRAM_ID);
    assert.equal(call.config.encoding, "base64");
    assert.deepEqual(
      call.config.filters.map((f) => ({
        offset: f.memcmp.offset,
        bytes: Buffer.from(f.memcmp.bytes, "base64").toString("hex"),
      })),
      [
        { offset: 0n, bytes: Buffer.from([92, 157, 163, 130, 72, 254, 86, 216]).toString("hex") },
        { offset: 138n, bytes: Buffer.from(addr.encode(DISPUTE)).toString("hex") },
      ],
    );
  } finally {
    cas.close();
  }
});
test("decodeItemView: fixed offsets, u64s as strings, zero pubkeys as null", () => {
  const view = decodeItemView(
    itemBytes(),
    "Iteaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
  );
  assert.equal(view.address, "Iteaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(view.creator, CREATOR);
  assert.equal(view.nonce, "7");
  assert.equal(view.claimHash, CLAIM_HASH_HEX);
  assert.equal(view.seed, "11");
  assert.equal(view.pot, "13");
  assert.equal(view.expiresAt, "17");
  assert.equal(view.subaccord, SUBACCORD);
  assert.equal(view.state, "Challenging");
  assert.equal(view.currentDispute, DISPUTE);
  assert.equal(view.challenger, CHALLENGER);
  assert.equal(view.defenseCount, 3);
  assert.equal(view.mint, MINT);
  assert.equal(view.creatorShareBps, 1000);
  assert.equal(view.challengeWindowSecs, "60");
});

test("decodeItemView: zeroed current_dispute/challenger decode as null", () => {
  const bytes = itemBytes();
  bytes.set(new Uint8Array(32), 138);
  bytes.set(new Uint8Array(32), 170);
  const view = decodeItemView(bytes, "Iteaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address);
  assert.equal(view.currentDispute, null);
  assert.equal(view.challenger, null);
});

test("decodeItemView: short account or wrong discriminator throws", () => {
  const short = itemBytes().subarray(0, 100);
  assert.throws(
    () => decodeItemView(short, "Iteaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address),
    InveigoCaseError,
  );
  const wrongDisc = itemBytes();
  wrongDisc.set([0, 0, 0, 0, 0, 0, 0, 0], 0);
  assert.throws(
    () => decodeItemView(wrongDisc, "Iteaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address),
    InveigoCaseError,
  );
});

test("readInveigoCase: resolves item, fetches thesis, verifies hash + court", async () => {
  const cas = stubFetch({
    [`${ENDPOINT}/domains/${CLAIM_HASH_HEX}`]: { status: 200, bytes: THESIS_BYTES },
  });
  try {
    const result = await readInveigoCase({
      rpc: stubRpc([gpaResult(itemBytes())]),
      endpoint: ENDPOINT,
      dispute: DISPUTE,
      expectedSubaccord: SUBACCORD,
    });
    assert.ok(result);
    assert.equal(result.protocol, "inveigo");
    assert.equal(result.dispute, DISPUTE);
    assert.equal(result.item.subaccord, SUBACCORD);
    assert.equal(result.item.currentDispute, DISPUTE);
    assert.equal(result.thesis, THESIS);
    assert.equal(result.checks.courtMatches, true);
  } finally {
    cas.close();
  }
});

test("readInveigoCase: court mismatch is reported, not thrown", async () => {
  const cas = stubFetch({});
  try {
    const result = await readInveigoCase({
      rpc: stubRpc([gpaResult(itemBytes())]),
      endpoint: ENDPOINT,
      dispute: DISPUTE,
      expectedSubaccord: OTHER_COURT,
    });
    assert.ok(result);
    assert.equal(result.checks.courtMatches, false);
    assert.equal(result.thesis, null); // no CAS route → 404
  } finally {
    cas.close();
  }
});

test("readInveigoCase: zero matches → null (not an inveigo dispute)", async () => {
  const cas = stubFetch({});
  try {
    const result = await readInveigoCase({
      rpc: stubRpc([]),
      endpoint: ENDPOINT,
      dispute: DISPUTE,
    });
    assert.equal(result, null);
    assert.deepEqual(cas.calls, []); // no CAS fetch when no item resolved
  } finally {
    cas.close();
  }
});

test("readInveigoCase: two items claiming one dispute → invariant error", async () => {
  const cas = stubFetch({});
  try {
    await assert.rejects(
      readInveigoCase({
        rpc: stubRpc([
          gpaResult(itemBytes()),
          gpaResult(itemBytes(), "Itebbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
        ]),
        endpoint: ENDPOINT,
        dispute: DISPUTE,
      }),
      InveigoCaseError,
    );
  } finally {
    cas.close();
  }
});

test("readInveigoCase: CAS 404 → thesis null (definitively absent)", async () => {
  const cas = stubFetch({});
  try {
    const result = await readInveigoCase({
      rpc: stubRpc([gpaResult(itemBytes())]),
      endpoint: ENDPOINT,
      dispute: DISPUTE,
    });
    assert.ok(result);
    assert.equal(result.thesis, null);
    assert.equal(result.checks.courtMatches, null); // expectedSubaccord not supplied
  } finally {
    cas.close();
  }
});

test("readInveigoCase: CAS bytes not hashing to claim_hash → tamper error", async () => {
  const cas = stubFetch({
    [`${ENDPOINT}/domains/${CLAIM_HASH_HEX}`]: {
      status: 200,
      bytes: new TextEncoder().encode("tampered thesis"),
    },
  });
  try {
    await assert.rejects(
      readInveigoCase({
        rpc: stubRpc([gpaResult(itemBytes())]),
        endpoint: ENDPOINT,
        dispute: DISPUTE,
      }),
      InveigoCaseError,
    );
  } finally {
    cas.close();
  }
});

test("readInveigoCase: CAS transport failure → error (unknown, not absent)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    await assert.rejects(
      readInveigoCase({
        rpc: stubRpc([gpaResult(itemBytes())]),
        endpoint: ENDPOINT,
        dispute: DISPUTE,
      }),
    );
  } finally {
    globalThis.fetch = original;
  }
});
