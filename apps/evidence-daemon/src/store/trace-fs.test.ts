// trace-fs.test.ts — FsTraceStore behaviour tests (ADR-0037).
//
// Append/read roundtrip (batches expand to seq-ordered per-event envelopes,
// events verbatim), idempotent re-append of a stored seq (seq-check on
// append), stale-seq guard, juror/fromSeq filters with (juror, seq)
// ordering, unknown dispute → [], the `traces/{sub}/{dispute}/{juror}.jsonl`
// layout, and the base58 path-hygiene guard (traversal). Runs against a real
// temp dir (Bun).
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, type Address } from "@solana/kit";

import { FsTraceStore } from "./trace-fs.js";
import type { TraceBatch, TraceEventRecord } from "./trace.js";

const SUB: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DISPUTE: Address = address("11111111111111111111111111111111");
// "9xQe…" sorts before "ATok…" — pins the (juror, seq) cross-juror order.
const JUROR_A: Address = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const JUROR_B: Address = address("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "trace-fs-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function batch(
  seq: number,
  events: TraceEventRecord[] = [{ type: "duty-open", round: 0 }],
  juror: Address = JUROR_A,
): TraceBatch {
  return { subaccord: SUB, dispute: DISPUTE, juror, seq, at: 1000 + seq, events };
}

function seqs(es: { juror: Address; seq: number }[]): string[] {
  return es.map((e) => `${e.juror}/${e.seq}`);
}

describe("FsTraceStore — appendBatch/readEvents", () => {
  test("round-trips batches: events expand to seq-ordered envelopes, verbatim", async () => {
    const store = new FsTraceStore({ rootDir });
    await store.appendBatch(batch(1, [{ type: "duty-open", round: 2 }]));
    await store.appendBatch(
      batch(2, [
        { type: "step", n: 1 },
        { type: "step", n: 2 },
      ]),
    );
    const es = await store.readEvents(DISPUTE);
    expect(es.map((e) => e.seq)).toEqual([1, 2, 2]);
    expect(es[0]!.v).toBe(1);
    expect(es[0]!.at).toBe(1001);
    expect(es[0]!.dispute).toBe(DISPUTE);
    expect(es[0]!.event).toEqual({ type: "duty-open", round: 2 });
    expect(es[1]!.event).toEqual({ type: "step", n: 1 });
    expect(es[2]!.event).toEqual({ type: "step", n: 2 });
  });

  test("re-append of a stored seq is an idempotent no-op", async () => {
    const store = new FsTraceStore({ rootDir });
    await store.appendBatch(batch(1));
    await store.appendBatch(batch(2));
    await store.appendBatch(batch(2, [{ type: "step", n: 9 }])); // same seq, different body
    const file = join(rootDir, "traces", SUB, DISPUTE, `${JUROR_A}.jsonl`);
    const lines = (await readFile(file, "utf-8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    const es = await store.readEvents(DISPUTE);
    expect(es).toHaveLength(2);
    expect(es[1]!.event).toEqual({ type: "duty-open", round: 0 }); // first write wins
  });

  test("stale seq (≤ last stored) is skipped, not appended", async () => {
    const store = new FsTraceStore({ rootDir });
    await store.appendBatch(batch(5));
    await store.appendBatch(batch(4));
    expect((await store.readEvents(DISPUTE)).map((e) => e.seq)).toEqual([5]);
  });

  test("fromSeq filters by batch seq", async () => {
    const store = new FsTraceStore({ rootDir });
    await store.appendBatch(batch(1));
    await store.appendBatch(batch(2));
    await store.appendBatch(batch(3));
    expect((await store.readEvents(DISPUTE, undefined, 2)).map((e) => e.seq)).toEqual([2, 3]);
  });

  test("juror filter + (juror, seq) ordering across jurors", async () => {
    const store = new FsTraceStore({ rootDir });
    await store.appendBatch(batch(1, undefined, JUROR_A));
    await store.appendBatch(batch(2, undefined, JUROR_A));
    await store.appendBatch(batch(1, undefined, JUROR_B));
    expect(seqs(await store.readEvents(DISPUTE))).toEqual([
      `${JUROR_B}/1`,
      `${JUROR_A}/1`,
      `${JUROR_A}/2`,
    ]);
    expect(seqs(await store.readEvents(DISPUTE, JUROR_A))).toEqual([
      `${JUROR_A}/1`,
      `${JUROR_A}/2`,
    ]);
  });

  test("unknown dispute / juror reads as empty", async () => {
    const store = new FsTraceStore({ rootDir });
    await store.appendBatch(batch(1));
    expect(await store.readEvents(DISPUTE, JUROR_B)).toEqual([]);
    const other: Address = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");
    expect(await store.readEvents(other)).toEqual([]);
  });

  test("lastSeq: highest stored seq, or null when none", async () => {
    const store = new FsTraceStore({ rootDir });
    expect(await store.lastSeq(SUB, DISPUTE, JUROR_A)).toBeNull();
    await store.appendBatch(batch(1));
    await store.appendBatch(batch(3));
    expect(await store.lastSeq(SUB, DISPUTE, JUROR_A)).toBe(3);
    expect(await store.lastSeq(SUB, DISPUTE, JUROR_B)).toBeNull();
  });

  test("layout: one JSONL file per juror under traces/{sub}/{dispute}", async () => {
    const store = new FsTraceStore({ rootDir });
    await store.appendBatch(batch(1, undefined, JUROR_A));
    await store.appendBatch(batch(1, undefined, JUROR_B));
    const disputeDir = join(rootDir, "traces", SUB, DISPUTE);
    expect((await readdir(disputeDir)).sort()).toEqual(
      [`${JUROR_A}.jsonl`, `${JUROR_B}.jsonl`].sort(),
    );
  });

  test("path hygiene: non-base58 segments are rejected before touching the fs", async () => {
    const store = new FsTraceStore({ rootDir });
    await expect(store.appendBatch({ ...batch(1), dispute: "../evil" as Address })).rejects.toThrow(
      /dispute/,
    );
    await expect(store.appendBatch({ ...batch(1), juror: "a/b" as Address })).rejects.toThrow(
      /juror/,
    );
    expect(await store.readEvents(DISPUTE)).toEqual([]);
    expect(await readdir(rootDir)).toEqual([]); // nothing was ever created
  });
});

describe("FsTraceStore — public stamp (ADR-0013 amendment)", () => {
  test("markPublic → isPublic true; idempotent re-mark; others unstamped", async () => {
    const store = new FsTraceStore({ rootDir });
    expect(await store.isPublic(DISPUTE)).toBe(false);
    await store.markPublic(DISPUTE);
    await store.markPublic(DISPUTE); // idempotent
    expect(await store.isPublic(DISPUTE)).toBe(true);
    expect(await store.isPublic(JUROR_A)).toBe(false);
  });

  test("path hygiene: non-base58 dispute rejected", async () => {
    const store = new FsTraceStore({ rootDir });
    await expect(store.markPublic("../evil" as Address)).rejects.toThrow(/dispute/);
  });
});
