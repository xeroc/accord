// delivery-key-fs.test.ts — FsDeliveryKeyStore behaviour tests (ADR-0034).
//
// Round-trip, last-writer-wins overwrite, miss → null, and the
// `juror-keys/{juror}.json` subtree layout (retention sweeps never touch it —
// the namespace is not dispute-scoped). Runs against a real temp dir (Bun).
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, type Address } from "@solana/kit";

import { FsDeliveryKeyStore } from "./delivery-key-fs.js";
import type { JurorDeliveryKey } from "./delivery-key.js";

const JUROR_A: Address = address("11111111111111111111111111111111");
const JUROR_B: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "delivery-key-fs-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function key(juror: Address, registeredAt: number): JurorDeliveryKey {
  return {
    juror,
    encPub: new Uint8Array(32).fill(registeredAt % 256),
    registeredAt,
  };
}

describe("FsDeliveryKeyStore — put/get", () => {
  test("round-trips a registration", async () => {
    const store = new FsDeliveryKeyStore({ rootDir });
    const k = key(JUROR_A, 42);
    await store.put(k);
    const got = await store.get(JUROR_A);
    expect(got).not.toBeNull();
    expect(got!.juror).toBe(JUROR_A);
    expect(Array.from(got!.encPub)).toEqual(Array.from(k.encPub));
    expect(got!.registeredAt).toBe(42);
  });

  test("get on an unregistered juror returns null", async () => {
    const store = new FsDeliveryKeyStore({ rootDir });
    expect(await store.get(JUROR_A)).toBeNull();
  });

  test("put overwrites — one active key per juror, last-writer-wins", async () => {
    const store = new FsDeliveryKeyStore({ rootDir });
    await store.put(key(JUROR_A, 1));
    await store.put(key(JUROR_A, 2));
    const got = await store.get(JUROR_A);
    expect(got!.registeredAt).toBe(2);
  });

  test("registrations are stored under juror-keys/{juror}.json", async () => {
    const store = new FsDeliveryKeyStore({ rootDir });
    await store.put(key(JUROR_B, 1));
    const entries = await readdir(join(rootDir, "juror-keys"));
    expect(entries).toEqual([`${JUROR_B}.json`]);
  });
});
