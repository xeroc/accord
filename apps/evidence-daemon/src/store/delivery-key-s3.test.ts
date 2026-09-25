// delivery-key-s3.test.ts — S3DeliveryKeyStore behaviour tests (ADR-0034).
//
// Same in-memory S3 mock approach as domain-s3.test.ts: the mock implements
// the exact command subset the store uses and throws the REAL
// `@aws-sdk/client-s3` error classes so the NoSuchKey/NotFound branches are
// exercised against the genuine SDK identity. Round-trip, overwrite
// last-writer-wins, miss → null, and the `juror-keys/{juror}` key layout.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { describe, expect, test } from "bun:test";
import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { address, type Address } from "@solana/kit";

import { S3DeliveryKeyStore } from "./delivery-key-s3.js";
import type { JurorDeliveryKey } from "./delivery-key.js";

const JUROR_A: Address = address("11111111111111111111111111111111");
const BUCKET = "evidence-test";

/** Minimal in-memory S3 (duck-typed `.send(command)`, real command classes). */
class MockS3 {
  readonly objects = new Map<string, string>();

  async send(cmd: unknown): Promise<unknown> {
    if (cmd instanceof PutObjectCommand) {
      const input = (cmd as unknown as { input: { Bucket?: string; Key?: string; Body?: string } })
        .input;
      this.objects.set(`${input.Bucket}/${input.Key}`, input.Body ?? "");
      return {};
    }
    if (cmd instanceof GetObjectCommand) {
      const { Bucket, Key } = (cmd as unknown as { input: { Bucket?: string; Key?: string } })
        .input;
      const body = this.objects.get(`${Bucket}/${Key}`);
      if (body === undefined) throw new NoSuchKey({ $metadata: {}, message: "Not Found" });
      return {
        Body: { transformToString: async (): Promise<string> => body },
      };
    }
    throw new Error(
      `MockS3: unhandled command ${(cmd as { constructor?: { name?: string } })?.constructor?.name}`,
    );
  }
}

function key(registeredAt: number): JurorDeliveryKey {
  return {
    juror: JUROR_A,
    encPub: new Uint8Array(32).fill(registeredAt % 256),
    registeredAt,
  };
}

function setup(): { store: S3DeliveryKeyStore; mock: MockS3 } {
  const mock = new MockS3();
  return {
    store: new S3DeliveryKeyStore({ client: mock as unknown as S3Client, bucket: BUCKET }),
    mock,
  };
}

describe("S3DeliveryKeyStore — put/get", () => {
  test("round-trips a registration via the juror-keys/{juror} key", async () => {
    const { store, mock } = setup();
    const k = key(7);
    await store.put(k);
    expect(mock.objects.has(`${BUCKET}/juror-keys/${JUROR_A}`)).toBe(true);
    const got = await store.get(JUROR_A);
    expect(got).not.toBeNull();
    expect(got!.juror).toBe(JUROR_A);
    expect(Array.from(got!.encPub)).toEqual(Array.from(k.encPub));
    expect(got!.registeredAt).toBe(7);
  });

  test("get on an unregistered juror returns null (NoSuchKey path)", async () => {
    const { store } = setup();
    expect(await store.get(JUROR_A)).toBeNull();
  });

  test("put overwrites — one active key per juror, last-writer-wins", async () => {
    const { store } = setup();
    await store.put(key(1));
    await store.put(key(2));
    expect((await store.get(JUROR_A))!.registeredAt).toBe(2);
  });
});
