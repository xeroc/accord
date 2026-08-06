// s3.test.ts — S3Store behaviour tests (bean accord-3u1e).
//
// Uses a faithful in-memory S3 mock instead of a docker MinIO testcontainer
// (the bean sanctions "MinIO testcontainer OR S3 mock"). The mock implements
// the exact command subset S3Store uses and replicates the S3 semantics the
// store DEPENDS on:
//  - metadata keys are lowercased on store (S3 normalises user-metadata),
//  - HeadObject on a missing key throws NotFound,
//  - GetObject on a missing key throws NoSuchKey,
//  - GetObject Body exposes transformToString("utf-8").
// Critically, the mock throws the REAL `@aws-sdk/client-s3` error classes, so
// the store's `instanceof NotFound` / `instanceof NoSuchKey` branches are
// exercised against the genuine SDK identity (ESM module singleton).
//
// Run: `pnpm --filter @accord/evidence-daemon test` (→ bun test).

import { describe, expect, test } from "bun:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { address } from "@solana/kit";
import { S3Store } from "./s3.js";
import {
  EvidenceConflictError,
  type EvidenceBundle,
  base64ToBytes,
  bytesToBase64,
  serializeBundle,
} from "./store.js";

// Two distinct, valid 32-byte Solana addresses (system program + token
// program) — address() brands + validates base58/length.
const SUBACCORD = address("11111111111111111111111111111111");
const DISPUTE = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const BUCKET = "evidence-test";

/** A stored S3 object as the mock sees it. */
interface StoredObject {
  body: string;
  meta: Record<string, string>;
}

/**
 * Minimal in-memory S3. Duck-typed to what S3Store calls (`.send(command)`).
 * Dispatches on the real command class identity (shared SDK module), so adding
 * a command the store doesn't use is a non-issue — only the four the store
 * sends are handled.
 */
class MockS3 {
  readonly objects = new Map<string, StoredObject>();
  // ponytail: Map key is `${bucket}/${key}`; flat namespace is enough for tests.
  private k(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }
  async send(cmd: unknown): Promise<unknown> {
    // HeadObject — metadata only.
    if (cmd instanceof HeadObjectCommand) {
      const { Bucket, Key } = (cmd as unknown as { input: { Bucket?: string; Key?: string } })
        .input;
      const obj = this.objects.get(this.k(Bucket!, Key!));
      if (obj === undefined) throw new NotFound({ $metadata: {}, message: "Not Found" });
      return { Metadata: { ...obj.meta } };
    }
    // PutObject — lowercases metadata keys (real S3 normalisation).
    if (cmd instanceof PutObjectCommand) {
      const input = (
        cmd as unknown as {
          input: {
            Bucket?: string;
            Key?: string;
            Body?: string;
            Metadata?: Record<string, string>;
          };
        }
      ).input;
      const meta: Record<string, string> = {};
      for (const [mk, mv] of Object.entries(input.Metadata ?? {})) {
        meta[mk.toLowerCase()] = String(mv);
      }
      this.objects.set(this.k(input.Bucket!, input.Key!), {
        body: typeof input.Body === "string" ? input.Body : "",
        meta,
      });
      return {};
    }
    // GetObject — Body.transformToString("utf-8").
    if (cmd instanceof GetObjectCommand) {
      const { Bucket, Key } = (cmd as unknown as { input: { Bucket?: string; Key?: string } })
        .input;
      const obj = this.objects.get(this.k(Bucket!, Key!));
      if (obj === undefined) throw new NoSuchKey({ $metadata: {}, message: "Not Found" });
      const body = obj.body;
      return {
        Body: {
          transformToString: async (): Promise<string> => body,
        },
      };
    }
    // DeleteObject — idempotent (no error on missing), real S3 returns 204.
    if (cmd instanceof DeleteObjectCommand) {
      const { Bucket, Key } = (cmd as unknown as { input: { Bucket?: string; Key?: string } })
        .input;
      this.objects.delete(this.k(Bucket!, Key!));
      return {};
    }
    throw new Error(
      `MockS3: unhandled command ${(cmd as { constructor?: { name?: string } })?.constructor?.name}`,
    );
  }
}

/** Build a bundle with deterministic ciphertext-ish fields; `over` overrides. */
function mkBundle(over: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    subaccord: SUBACCORD,
    dispute: DISPUTE,
    ct: new Uint8Array([1, 2, 3, 4, 5]),
    claimantEphemPub: new Uint8Array(32).fill(9),
    wrapped: new Uint8Array(32).fill(7),
    plaintextHash: new Uint8Array(32).fill(0xab),
    ingestedAt: 1_700_000_000_000,
    ...over,
  };
}

/** Wire an S3Store over a fresh mock. */
function setup(): { store: S3Store; mock: MockS3 } {
  const mock = new MockS3();
  const store = new S3Store({
    client: mock as unknown as S3Client,
    bucket: BUCKET,
  });
  return { store, mock };
}

describe("S3Store — put/get round-trip", () => {
  test("put then get returns an equal bundle", async () => {
    const { store } = setup();
    const b = mkBundle();
    await store.put(b);
    const got = await store.get(SUBACCORD, DISPUTE);
    expect(got).not.toBeNull();
    expect(got!.subaccord).toBe(SUBACCORD);
    expect(got!.dispute).toBe(DISPUTE);
    expect(Array.from(got!.ct)).toEqual(Array.from(b.ct));
    expect(Array.from(got!.claimantEphemPub)).toEqual(Array.from(b.claimantEphemPub));
    expect(Array.from(got!.wrapped)).toEqual(Array.from(b.wrapped));
    expect(Array.from(got!.plaintextHash)).toEqual(Array.from(b.plaintextHash));
    expect(got!.ingestedAt).toBe(b.ingestedAt);
  });

  test("get on a missing key returns null", async () => {
    const { store } = setup();
    const got = await store.get(SUBACCORD, DISPUTE);
    expect(got).toBeNull();
  });

  test("get on a different (missing) dispute returns null", async () => {
    const { store } = setup();
    await store.put(mkBundle());
    const other = address("Stake11111111111111111111111111111111111111");
    const got = await store.get(SUBACCORD, other);
    expect(got).toBeNull();
  });
});

describe("S3Store — idempotency on plaintextHash", () => {
  test("re-PUT of the SAME hash is a no-op (no error, object untouched)", async () => {
    const { store, mock } = setup();
    const b = mkBundle({ ingestedAt: 1_700_000_000_000 });
    await store.put(b);
    const before = mock.objects.get(`${BUCKET}/${SUBACCORD}/${DISPUTE}`);
    // Second PUT with the same hash but a different ingestedAt — must NOT overwrite.
    await store.put(mkBundle({ ingestedAt: 9_999_999_999_999 }));
    const after = mock.objects.get(`${BUCKET}/${SUBACCORD}/${DISPUTE}`);
    expect(after).toBeDefined();
    expect(after!.body).toBe(before!.body); // byte-identical, not rewritten
    // The original ingestedAt is what survives (proves the no-op path).
    expect(after!.meta["ingested-at"]).toBe("1700000000000");
  });

  test("re-PUT of a DIFFERENT hash throws EvidenceConflictError", async () => {
    const { store } = setup();
    await store.put(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x01) }));
    await expect(
      store.put(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x02) })),
    ).rejects.toBeInstanceOf(EvidenceConflictError);
  });

  test("conflict error carries the existing hash and coordinates", async () => {
    const { store } = setup();
    const existing = new Uint8Array(32).fill(0x11);
    await store.put(mkBundle({ plaintextHash: existing }));
    let caught: EvidenceConflictError | undefined;
    try {
      await store.put(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x22) }));
    } catch (e) {
      if (e instanceof EvidenceConflictError) caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught!.subaccord).toBe(SUBACCORD);
    expect(caught!.dispute).toBe(DISPUTE);
    expect(Array.from(caught!.existingHash)).toEqual(Array.from(existing));
  });

  test("an object present WITHOUT our plaintext-hash metadata is treated as a conflict", async () => {
    const { store, mock } = setup();
    // Foreign object (not written by us) — simulates a colliding key / tamper.
    mock.objects.set(`${BUCKET}/${SUBACCORD}/${DISPUTE}`, {
      body: '{"v":1}',
      meta: { "some-other-key": "x" }, // no plaintext-hash
    });
    await expect(store.put(mkBundle())).rejects.toBeInstanceOf(EvidenceConflictError);
  });
});

describe("S3Store — never-plaintext invariant", () => {
  test("the persisted object body is the ciphertext bundle, never the plaintext", async () => {
    const { store, mock } = setup();
    // The conceptual plaintext the claimant encrypted. It must NEVER be persisted.
    const PLAINTEXT_SENTINEL = "PLAINTEXT_MUST_NEVER_BE_PERSISTED_xyz";
    const plaintextBytes = new TextEncoder().encode(PLAINTEXT_SENTINEL);

    // Build a bundle whose `ct` is the only place plaintext *could* leak from.
    // ct here is an unrelated ciphertext; the real plaintext is not a field.
    const b: EvidenceBundle = {
      subaccord: SUBACCORD,
      dispute: DISPUTE,
      ct: new Uint8Array([0xde, 0xad, 0xbe, 0xef]), // ciphertext, not plaintext
      claimantEphemPub: new Uint8Array(32).fill(1),
      wrapped: new Uint8Array(32).fill(2),
      plaintextHash: new Uint8Array(32).fill(0xcd),
      ingestedAt: 1_700_000_000_000,
    };
    void plaintextBytes;
    await store.put(b);

    const stored = mock.objects.get(`${BUCKET}/${SUBACCORD}/${DISPUTE}`);
    expect(stored).toBeDefined();

    // 1. Body is byte-identical to serializeBundle — the store writes only this.
    expect(stored!.body).toBe(serializeBundle(b));

    // 2. The plaintext sentinel appears nowhere in the persisted object (body or
    //    metadata). Catches any future regression that adds a plaintext field.
    const persisted = stored!.body + JSON.stringify(stored!.meta);
    expect(persisted).not.toContain(PLAINTEXT_SENTINEL);

    // 3. The JSON object has exactly the ciphertext schema — no `plaintext` key.
    const parsed = JSON.parse(stored!.body) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "claimant_ephem_pub",
        "ct",
        "dispute",
        "ingested_at",
        "plaintext_hash",
        "subaccord",
        "v",
        "wrapped",
      ].sort(),
    );
    expect(parsed).not.toHaveProperty("plaintext");

    // 4. The stored `ct` round-trips to the exact ciphertext bytes (not plaintext).
    const ctField = base64ToBytes(parsed["ct"] as string);
    expect(Array.from(ctField)).toEqual(Array.from(b.ct));
  });

  test("base64 helpers round-trip (sanity for the byte fields above)", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});

describe("S3Store — exists / delete", () => {
  test("exists is false before put and true after", async () => {
    const { store } = setup();
    expect(await store.exists(SUBACCORD, DISPUTE)).toBe(false);
    await store.put(mkBundle());
    expect(await store.exists(SUBACCORD, DISPUTE)).toBe(true);
  });

  test("exists is false for a missing key", async () => {
    const { store } = setup();
    expect(await store.exists(SUBACCORD, DISPUTE)).toBe(false);
  });

  test("delete is idempotent: deleting a missing key is a no-op", async () => {
    const { store } = setup();
    await expect(store.delete(SUBACCORD, DISPUTE)).resolves.toBeUndefined();
    // delete after put, then get returns null and exists false.
    await store.put(mkBundle());
    await store.delete(SUBACCORD, DISPUTE);
    expect(await store.exists(SUBACCORD, DISPUTE)).toBe(false);
    expect(await store.get(SUBACCORD, DISPUTE)).toBeNull();
    // delete again — still no error.
    await expect(store.delete(SUBACCORD, DISPUTE)).resolves.toBeUndefined();
  });
});
