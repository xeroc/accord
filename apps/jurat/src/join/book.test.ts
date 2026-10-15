/** book.test.ts — joined-subaccord book persistence (bean accord-5pkj). */

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, type Address } from "@solana/kit";

import { loadBook, saveBook, totalStaked, upsertEntry } from "./book.js";

const SUB_A = address("1".repeat(31) + "2");
const SUB_B = address("1".repeat(31) + "3");
const TOKEN = address("1".repeat(31) + "4");

describe("joined book", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "jurat-book-"));
  });

  test("missing file reads as the empty book", async () => {
    const book = await loadBook(stateDir);
    expect(book.entries).toEqual([]);
    await rm(stateDir, { recursive: true, force: true });
  });

  test("save → load round-trips bigint stakes as strings", async () => {
    await saveBook(stateDir, {
      entries: [
        {
          subaccord: SUB_A,
          stakingToken: TOKEN,
          staked: 123_456_789n,
          signature: "sigA",
          joinedAt: "2026-10-15T00:00:00Z",
        },
      ],
    });
    const book = await loadBook(stateDir);
    await rm(stateDir, { recursive: true, force: true });
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0]).toEqual({
      subaccord: SUB_A,
      stakingToken: TOKEN,
      staked: 123_456_789n,
      signature: "sigA",
      joinedAt: "2026-10-15T00:00:00Z",
    });
  });

  test("upsertEntry replaces the same subaccord, appends new ones", async () => {
    const first = upsertEntry(
      { entries: [] },
      entry(SUB_A, 100n, "sig1"),
    );
    const second = upsertEntry(first, entry(SUB_B, 200n, "sig2"));
    const replaced = upsertEntry(second, entry(SUB_A, 300n, "sig3"));
    expect(replaced.entries.map((e) => e.subaccord)).toEqual([SUB_B, SUB_A]);
    expect(totalStaked(replaced)).toBe(500n);
    await rm(stateDir, { recursive: true, force: true });
  });
});

function entry(subaccord: Address, staked: bigint, signature: string) {
  return {
    subaccord,
    stakingToken: TOKEN,
    staked,
    signature,
    joinedAt: "2026-10-15T00:00:00Z",
  };
}
