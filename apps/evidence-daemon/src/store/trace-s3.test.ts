// trace-s3.test.ts — S3TraceStore behaviour tests (ADR-0037).
//
// Same in-memory S3 mock approach as delivery-key-s3.test.ts: the mock
// implements the exact command subset the store uses and throws the REAL
// `@aws-sdk/client-s3` error classes so the NotFound/NoSuchKey branches are
// exercised against the genuine SDK identity. One immutable object per batch
// at `traces/{sub}/{dispute}/{juror}/{seq}.json` (Head-first: same-seq
// re-append never re-puts), replay = prefix list (paginated) + sort, and the
// base58 path-hygiene guard.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { describe, expect, test } from "bun:test";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { address, type Address } from "@solana/kit";

import { S3TraceStore } from "./trace-s3.js";
import type { TraceBatch, TraceEventRecord } from "./trace.js";

const SUB: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DISPUTE: Address = address("11111111111111111111111111111111");
// "9xQe…" sorts before "ATok…" — pins the (juror, seq) cross-juror order.
const JUROR_A: Address = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const JUROR_B: Address = address("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
const BUCKET = "evidence-test";

/** The exact command subset the store sends; typed so narrowing does the work. */
type MockCommand = PutObjectCommand | HeadObjectCommand | GetObjectCommand | ListObjectsV2Command;

/** Minimal in-memory S3 (duck-typed `.send(command)`, real command classes). */
class MockS3 {
  readonly objects = new Map<string, string>();
  readonly puts: string[] = [];
  /** ListObjectsV2 page size — exercises the store's pagination loop. */
  readonly pageSize = 2;

  async send(cmd: MockCommand): Promise<unknown> {
    if (cmd instanceof PutObjectCommand) {
      const body = typeof cmd.input.Body === "string" ? cmd.input.Body : "";
      const key = `${cmd.input.Bucket}/${cmd.input.Key}`;
      this.objects.set(key, body);
      this.puts.push(key);
      return {};
    }
    if (cmd instanceof HeadObjectCommand) {
      if (!this.objects.has(`${cmd.input.Bucket}/${cmd.input.Key}`)) {
        throw new NotFound({ $metadata: {}, message: "Not Found" });
      }
      return {};
    }
    if (cmd instanceof GetObjectCommand) {
      const body = this.objects.get(`${cmd.input.Bucket}/${cmd.input.Key}`);
      if (body === undefined) throw new NoSuchKey({ $metadata: {}, message: "Not Found" });
      return { Body: { transformToString: async (): Promise<string> => body } };
    }
    if (cmd instanceof ListObjectsV2Command) {
      const bucket = cmd.input.Bucket ?? "";
      const keys = [...this.objects.keys()]
        .filter((k) => k.startsWith(`${bucket}/${cmd.input.Prefix ?? ""}`))
        .sort()
        .map((k) => k.slice(`${bucket}/`.length));
      const offset =
        cmd.input.ContinuationToken === undefined ? 0 : Number(cmd.input.ContinuationToken);
      const page = keys.slice(offset, offset + this.pageSize);
      const truncated = offset + this.pageSize < keys.length;
      return {
        Contents: page.map((Key) => ({ Key })),
        IsTruncated: truncated,
        NextContinuationToken: truncated ? String(offset + this.pageSize) : undefined,
      };
    }
    throw new Error("MockS3: unhandled command");
  }
}

function batch(
  seq: number,
  events: TraceEventRecord[] = [{ type: "duty-open", round: 0 }],
  juror: Address = JUROR_A,
): TraceBatch {
  return { subaccord: SUB, dispute: DISPUTE, juror, seq, at: 1000 + seq, events };
}

function setup(): { store: S3TraceStore; mock: MockS3 } {
  const mock = new MockS3();
  return {
    store: new S3TraceStore({ client: mock as unknown as S3Client, bucket: BUCKET }),
    mock,
  };
}

function keyFor(juror: Address, seq: number): string {
  return `${BUCKET}/traces/${SUB}/${DISPUTE}/${juror}/${seq}.json`;
}

function seqs(es: { juror: Address; seq: number }[]): string[] {
  return es.map((e) => `${e.juror}/${e.seq}`);
}

describe("S3TraceStore — appendBatch/readEvents", () => {
  test("puts one immutable object per batch at traces/{sub}/{dispute}/{juror}/{seq}.json", async () => {
    const { store, mock } = setup();
    await store.appendBatch(batch(1, [{ type: "step", n: 1 }]));
    await store.appendBatch(batch(2));
    expect(mock.objects.has(keyFor(JUROR_A, 1))).toBe(true);
    expect(mock.objects.has(keyFor(JUROR_A, 2))).toBe(true);
    const es = await store.readEvents(DISPUTE);
    expect(es.map((e) => e.seq)).toEqual([1, 2]);
    expect(es[0]!.event).toEqual({ type: "step", n: 1 });
  });

  test("re-append of a stored seq is a no-op — HeadObject hit, no re-put", async () => {
    const { store, mock } = setup();
    await store.appendBatch(batch(1, [{ type: "step", n: 1 }]));
    expect(mock.puts).toHaveLength(1);
    await store.appendBatch(batch(1, [{ type: "step", n: 9 }])); // same seq, different body
    expect(mock.puts).toHaveLength(1);
    expect((await store.readEvents(DISPUTE))[0]!.event).toEqual({ type: "step", n: 1 });
  });

  test("replay = prefix list + sort: out-of-order puts read back ordered by (juror, seq)", async () => {
    const { store } = setup();
    await store.appendBatch(batch(2, undefined, JUROR_A));
    await store.appendBatch(batch(1, undefined, JUROR_B));
    await store.appendBatch(batch(1, undefined, JUROR_A));
    await store.appendBatch(batch(2, undefined, JUROR_B));
    expect(seqs(await store.readEvents(DISPUTE))).toEqual([
      `${JUROR_B}/1`,
      `${JUROR_B}/2`,
      `${JUROR_A}/1`,
      `${JUROR_A}/2`,
    ]);
  });

  test("juror + fromSeq filters", async () => {
    const { store } = setup();
    await store.appendBatch(batch(1, undefined, JUROR_A));
    await store.appendBatch(batch(2, undefined, JUROR_A));
    await store.appendBatch(batch(1, undefined, JUROR_B));
    expect(seqs(await store.readEvents(DISPUTE, JUROR_A))).toEqual([
      `${JUROR_A}/1`,
      `${JUROR_A}/2`,
    ]);
    expect(seqs(await store.readEvents(DISPUTE, JUROR_A, 2))).toEqual([`${JUROR_A}/2`]);
  });

  test("empty namespace reads as []", async () => {
    const { store } = setup();
    expect(await store.readEvents(DISPUTE)).toEqual([]);
  });

  test("lastSeq: highest stored seq, or null when none", async () => {
    const { store } = setup();
    expect(await store.lastSeq(SUB, DISPUTE, JUROR_A)).toBeNull();
    await store.appendBatch(batch(1));
    await store.appendBatch(batch(3));
    expect(await store.lastSeq(SUB, DISPUTE, JUROR_A)).toBe(3);
    expect(await store.lastSeq(SUB, DISPUTE, JUROR_B)).toBeNull();
  });

  test("path hygiene: non-base58 segments are rejected before any S3 call", async () => {
    const { store, mock } = setup();
    await expect(
      store.appendBatch({ ...batch(1), subaccord: "../other-bucket" as Address }),
    ).rejects.toThrow(/subaccord/);
    expect(mock.objects.size).toBe(0);
  });
});
