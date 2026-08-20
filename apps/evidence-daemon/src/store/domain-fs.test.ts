// domain-fs.test.ts — FsDomainStore behaviour tests (bean accord-v9v9).
//
// Exercises the filesystem DomainStore backend against a real temp dir
// (Bun test). Mirrors domain-s3.test.ts so the two backends are provably
// equivalent: put/get round-trip (bytes AND content-type), format-blindness
// (arbitrary bytes in, identical bytes out — no parsing), idempotency on
// equal bytes, 409-conflict on different bytes at the same hash, a foreign
// (non-envelope) file ⇒ conflict, hash-format validation, exists, and the
// `domains/` subtree layout. No delete: retention is forever (ADR-0027).
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FsDomainStore } from "./domain-fs.js";
import { DomainConflictError, type DomainObject } from "./domain.js";

const HASH_A = "ab".repeat(32);
const HASH_B = "cd".repeat(32);

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "domain-fs-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

/** Build a domain object with deterministic fields; `over` overrides. */
function mkDomain(over: Partial<DomainObject> = {}): DomainObject {
  return {
    hash: HASH_A,
    // Includes invalid-UTF-8 bytes — the store must be format-blind.
    bytes: new Uint8Array([0x01, 0x02, 0xff, 0xfe, 0x00, 0x7f, 0x80]),
    contentType: "text/markdown",
    ...over,
  };
}

/** Wire an FsDomainStore over the per-test temp dir. */
function setup(): FsDomainStore {
  return new FsDomainStore({ rootDir });
}

describe("FsDomainStore — put/get round-trip", () => {
  test("put then get returns identical bytes and content-type", async () => {
    const store = setup();
    const o = mkDomain();
    await store.put(o);
    const got = await store.get(HASH_A);
    expect(got).not.toBeNull();
    expect(got!.hash).toBe(HASH_A);
    expect(Array.from(got!.bytes)).toEqual(Array.from(o.bytes));
    expect(got!.contentType).toBe("text/markdown");
  });

  test("content-type round-trips for a non-default type, params included", async () => {
    const store = setup();
    await store.put(mkDomain({ contentType: "application/pdf" }));
    const got = await store.get(HASH_A);
    expect(got!.contentType).toBe("application/pdf");

    await store.put(mkDomain({ hash: HASH_B, contentType: "text/markdown; charset=utf-8" }));
    const gotB = await store.get(HASH_B);
    expect(gotB!.contentType).toBe("text/markdown; charset=utf-8");
  });

  test("format-blind — arbitrary binary bytes round-trip untouched", async () => {
    const store = setup();
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i; // full byte range incl. invalid UTF-8
    await store.put(mkDomain({ bytes }));
    const got = await store.get(HASH_A);
    expect(Array.from(got!.bytes)).toEqual(Array.from(bytes));
  });

  test("get on a missing hash returns null", async () => {
    const store = setup();
    expect(await store.get(HASH_A)).toBeNull();
  });

  test("hashes are isolated keys", async () => {
    const store = setup();
    await store.put(mkDomain());
    await store.put(mkDomain({ hash: HASH_B, bytes: new Uint8Array([9, 9, 9]) }));
    const a = await store.get(HASH_A);
    const b = await store.get(HASH_B);
    expect(a!.bytes.length).toBe(7);
    expect(Array.from(b!.bytes)).toEqual([9, 9, 9]);
  });
});

describe("FsDomainStore — idempotency on bytes", () => {
  test("re-PUT of the SAME bytes is a no-op (file untouched, original content-type survives)", async () => {
    const store = setup();
    await store.put(mkDomain({ contentType: "text/markdown" }));
    const path = join(rootDir, "domains", `${HASH_A}.json`);
    const before = await readFile(path, "utf-8");
    // Same bytes, different content-type — must NOT overwrite (first write wins).
    await store.put(mkDomain({ contentType: "application/zip" }));
    const after = await readFile(path, "utf-8");
    expect(after).toBe(before); // byte-identical, not rewritten
    const parsed = JSON.parse(after) as Record<string, unknown>;
    expect(parsed["content_type"]).toBe("text/markdown");
  });

  test("re-PUT of DIFFERENT bytes at the same hash throws DomainConflictError", async () => {
    const store = setup();
    await store.put(mkDomain());
    await expect(store.put(mkDomain({ bytes: new Uint8Array([1, 2, 3]) }))).rejects.toBeInstanceOf(
      DomainConflictError,
    );
  });

  test("conflict error carries the hash", async () => {
    const store = setup();
    await store.put(mkDomain());
    let caught: DomainConflictError | undefined;
    try {
      await store.put(mkDomain({ bytes: new Uint8Array([4, 5, 6]) }));
    } catch (e) {
      if (e instanceof DomainConflictError) caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught!.hash).toBe(HASH_A);
  });

  test("a foreign (non-envelope) file at the key is treated as a conflict", async () => {
    const store = setup();
    // Foreign file (not written by us) — simulates a colliding path / tamper.
    const path = join(rootDir, "domains", `${HASH_A}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "not our envelope", "utf-8");
    await expect(store.put(mkDomain())).rejects.toBeInstanceOf(DomainConflictError);
  });
});

describe("FsDomainStore — hash validation", () => {
  test("put rejects a non-64-lowercase-hex hash (no path traversal)", async () => {
    const store = setup();
    await expect(store.put(mkDomain({ hash: "../evil" }))).rejects.toThrow(); // path traversal
    await expect(store.put(mkDomain({ hash: "AB".repeat(32) }))).rejects.toThrow(); // uppercase
    await expect(store.put(mkDomain({ hash: "ab".repeat(31) }))).rejects.toThrow(); // 63 chars
  });

  test("get / exists reject a malformed hash too", async () => {
    const store = setup();
    await expect(store.get("../evil")).rejects.toThrow();
    await expect(store.exists("../evil")).rejects.toThrow();
  });
});

describe("FsDomainStore — exists / layout", () => {
  test("exists is false before put and true after", async () => {
    const store = setup();
    expect(await store.exists(HASH_A)).toBe(false);
    await store.put(mkDomain());
    expect(await store.exists(HASH_A)).toBe(true);
  });

  test("objects land in the domains/ subtree, separate from evidence layout", async () => {
    const store = setup();
    await store.put(mkDomain());
    const path = join(rootDir, "domains", `${HASH_A}.json`);
    const raw = await readFile(path, "utf-8");
    expect(JSON.parse(raw)).toHaveProperty("v", 1);
  });

  test("get on a rootDir that does not exist returns null (reads as empty)", async () => {
    const store = new FsDomainStore({ rootDir: join(rootDir, "no-such-root") });
    expect(await store.get(HASH_A)).toBeNull();
    expect(await store.exists(HASH_A)).toBe(false);
  });
});
