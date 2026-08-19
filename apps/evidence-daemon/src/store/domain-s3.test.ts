// domain-s3.test.ts — S3DomainStore behaviour tests (bean accord-v9v9).
//
// Uses the same faithful in-memory S3 mock approach as s3.test.ts: the mock
// implements the exact command subset S3DomainStore uses and replicates the S3
// semantics the store DEPENDS on, throwing the REAL `@aws-sdk/client-s3`
// error classes so `instanceof NotFound` / `instanceof NoSuchKey` branches are
// exercised against the genuine SDK identity. Extended for the domain CAS:
// Uint8Array bodies, ContentType on Put/Get/Head, and a put counter to prove
// idempotent no-ops issue no second write.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { describe, expect, test } from "bun:test";
import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { S3DomainStore } from "./domain-s3.js";
import { DomainConflictError, type DomainObject } from "./domain.js";

const HASH_A = "ab".repeat(32);
const HASH_B = "cd".repeat(32);
const BUCKET = "evidence-test";

/** A stored S3 object as the mock sees it. */
interface StoredObject {
  body: Uint8Array;
  contentType?: string;
}

/**
 * Minimal in-memory S3. Duck-typed to what S3DomainStore calls (`.send(command)`).
 * Dispatches on the real command class identity (shared SDK module).
 */
class MockS3 {
  readonly objects = new Map<string, StoredObject>();
  /** Number of PutObjectCommands issued — proves idempotent no-ops don't write. */
  putCount = 0;
  // ponytail: Map key is `${bucket}/${key}`; flat namespace is enough for tests.
  private k(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }
  async send(cmd: unknown): Promise<unknown> {
    // HeadObject — existence probe.
    if (cmd instanceof HeadObjectCommand) {
      const { Bucket, Key } = (cmd as unknown as { input: { Bucket?: string; Key?: string } })
        .input;
      const obj = this.objects.get(this.k(Bucket!, Key!));
      if (obj === undefined) throw new NotFound({ $metadata: {}, message: "Not Found" });
      return { ContentType: obj.contentType };
    }
    // PutObject — byte body + content-type.
    if (cmd instanceof PutObjectCommand) {
      const input = (
        cmd as unknown as {
          input: {
            Bucket?: string;
            Key?: string;
            Body?: Uint8Array;
            ContentType?: string;
          };
        }
      ).input;
      this.putCount += 1;
      this.objects.set(this.k(input.Bucket!, input.Key!), {
        body: input.Body instanceof Uint8Array ? input.Body : new Uint8Array(),
        contentType: input.ContentType,
      });
      return {};
    }
    // GetObject — Body.transformToByteArray().
    if (cmd instanceof GetObjectCommand) {
      const { Bucket, Key } = (cmd as unknown as { input: { Bucket?: string; Key?: string } })
        .input;
      const obj = this.objects.get(this.k(Bucket!, Key!));
      if (obj === undefined) throw new NoSuchKey({ $metadata: {}, message: "Not Found" });
      const body = obj.body;
      return {
        ContentType: obj.contentType,
        Body: {
          transformToByteArray: async (): Promise<Uint8Array> => body,
        },
      };
    }
    throw new Error(
      `MockS3: unhandled command ${(cmd as { constructor?: { name?: string } })?.constructor?.name}`,
    );
  }
}

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

/** Wire an S3DomainStore over a fresh mock. */
function setup(): { store: S3DomainStore; mock: MockS3 } {
  const mock = new MockS3();
  const store = new S3DomainStore({
    client: mock as unknown as S3Client,
    bucket: BUCKET,
  });
  return { store, mock };
}

describe("S3DomainStore — put/get round-trip", () => {
  test("put then get returns identical bytes and content-type", async () => {
    const { store } = setup();
    const o = mkDomain();
    await store.put(o);
    const got = await store.get(HASH_A);
    expect(got).not.toBeNull();
    expect(got!.hash).toBe(HASH_A);
    expect(Array.from(got!.bytes)).toEqual(Array.from(o.bytes));
    expect(got!.contentType).toBe("text/markdown");
  });

  test("content-type round-trips for a non-default type, params included", async () => {
    const { store } = setup();
    await store.put(mkDomain({ contentType: "application/pdf" }));
    expect((await store.get(HASH_A))!.contentType).toBe("application/pdf");

    await store.put(mkDomain({ hash: HASH_B, contentType: "text/markdown; charset=utf-8" }));
    expect((await store.get(HASH_B))!.contentType).toBe("text/markdown; charset=utf-8");
  });

  test("format-blind — arbitrary binary bytes round-trip untouched", async () => {
    const { store } = setup();
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i; // full byte range incl. invalid UTF-8
    await store.put(mkDomain({ bytes }));
    const got = await store.get(HASH_A);
    expect(Array.from(got!.bytes)).toEqual(Array.from(bytes));
  });

  test("objects are stored under the domains/{hash} key", async () => {
    const { store, mock } = setup();
    await store.put(mkDomain());
    expect(mock.objects.has(`${BUCKET}/domains/${HASH_A}`)).toBe(true);
  });

  test("get on a missing key returns null", async () => {
    const { store } = setup();
    expect(await store.get(HASH_A)).toBeNull();
  });
});

describe("S3DomainStore — idempotency on bytes", () => {
  test("re-PUT of the SAME bytes is a no-op — no second write, original content-type survives", async () => {
    const { store, mock } = setup();
    await store.put(mkDomain({ contentType: "text/markdown" }));
    expect(mock.putCount).toBe(1);
    // Same bytes, different content-type — must NOT overwrite (first write wins).
    await store.put(mkDomain({ contentType: "application/zip" }));
    expect(mock.putCount).toBe(1); // no second PutObject
    expect((await store.get(HASH_A))!.contentType).toBe("text/markdown");
  });

  test("re-PUT of DIFFERENT bytes at the same hash throws DomainConflictError", async () => {
    const { store } = setup();
    await store.put(mkDomain());
    await expect(store.put(mkDomain({ bytes: new Uint8Array([1, 2, 3]) }))).rejects.toBeInstanceOf(
      DomainConflictError,
    );
  });

  test("conflict error carries the hash", async () => {
    const { store } = setup();
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

  test("a foreign object at the key with different bytes is a conflict", async () => {
    const { store, mock } = setup();
    // Foreign object (not written by us) — simulates a colliding key / tamper.
    mock.objects.set(`${BUCKET}/domains/${HASH_A}`, {
      body: new Uint8Array([0xaa, 0xbb]),
      contentType: "application/octet-stream",
    });
    await expect(store.put(mkDomain())).rejects.toBeInstanceOf(DomainConflictError);
  });

  test("a foreign object with the SAME bytes is an idempotent no-op", async () => {
    const { store, mock } = setup();
    const o = mkDomain();
    mock.objects.set(`${BUCKET}/domains/${HASH_A}`, {
      body: o.bytes,
      contentType: "application/octet-stream",
    });
    await store.put(o);
    expect(mock.putCount).toBe(0); // no overwrite, foreign content-type survives
    expect((await store.get(HASH_A))!.contentType).toBe("application/octet-stream");
  });
});

describe("S3DomainStore — hash validation / defaults", () => {
  test("put rejects a non-64-lowercase-hex hash before any S3 call", async () => {
    const { store, mock } = setup();
    await expect(store.put(mkDomain({ hash: "../evil" }))).rejects.toThrow();
    await expect(store.put(mkDomain({ hash: "AB".repeat(32) }))).rejects.toThrow();
    expect(mock.putCount).toBe(0);
    await expect(store.get("../evil")).rejects.toThrow();
    await expect(store.exists("../evil")).rejects.toThrow();
  });

  test("get of an object stored without a content-type defaults to text/markdown", async () => {
    const { store, mock } = setup();
    mock.objects.set(`${BUCKET}/domains/${HASH_A}`, { body: new Uint8Array([1]) });
    const got = await store.get(HASH_A);
    expect(got!.contentType).toBe("text/markdown");
  });
});

describe("S3DomainStore — exists", () => {
  test("exists is false before put and true after", async () => {
    const { store } = setup();
    expect(await store.exists(HASH_A)).toBe(false);
    await store.put(mkDomain());
    expect(await store.exists(HASH_A)).toBe(true);
    expect(await store.exists(HASH_B)).toBe(false);
  });
});
