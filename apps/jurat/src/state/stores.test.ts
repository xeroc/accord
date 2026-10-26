/**
 * stores.test.ts — unit tests for the file-backed DutyStore / VoteStore
 * (bean accord-vruh): roundtrip, reload-after-restart, key isolation.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { fileDutyStore, fileVoteStore } from "./stores";
import type { DutyRecord } from "../duty/types";
import type { VoteRecord } from "../vote/commit";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jurat-stores-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const DUTY: DutyRecord = {
  dispute: "Disp111111111111111111111111111111111111111",
  roundIdx: 0,
  status: "committed",
  updatedAt: 1_700_000_000,
  seat: 2,
  drawAttempt: 0,
  reviewEnd: 1_700_000_100,
  commitEnd: 1_700_000_200,
  revealEnd: 1_700_000_300,
};

const VOTE: VoteRecord = {
  dispute: DUTY.dispute,
  roundIdx: 0,
  salt: "ab".repeat(32),
  vote: "1",
  commitment: "cd".repeat(32),
  committed: true,
  dryRun: false,
  updatedAt: 1_700_000_000,
};

test("duty store: missing file loads undefined; save → load roundtrips", async () => {
  const store = fileDutyStore(dir);
  expect(await store.load(DUTY.dispute, 0)).toBeUndefined();
  await store.save(DUTY);
  expect(await store.load(DUTY.dispute, 0)).toEqual(DUTY);
  // key isolation: another round of the same dispute is a different record
  expect(await store.load(DUTY.dispute, 1)).toBeUndefined();
});

test("duty store: records survive a restart (fresh store over the same dir)", async () => {
  await fileDutyStore(dir).save(DUTY);
  expect(await fileDutyStore(dir).load(DUTY.dispute, 0)).toEqual(DUTY);
});

test("vote store: save → load roundtrips; salt hex survives verbatim", async () => {
  const store = fileVoteStore(dir);
  await store.save(VOTE);
  const loaded = await store.load(VOTE.dispute, 0);
  expect(loaded).toEqual(VOTE);
  expect(loaded!.salt.length).toBe(64);
});

test("vote store: dry-run record never reads as committed", async () => {
  const store = fileVoteStore(dir);
  await store.save({ ...VOTE, committed: false, dryRun: true, roundIdx: 3 });
  expect((await store.load(VOTE.dispute, 3))!.committed).toBe(false);
});
