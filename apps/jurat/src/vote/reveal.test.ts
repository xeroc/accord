// reveal.test.ts — unit contract for the vote executor's reveal path
// (bean accord-qk0q): reveal at window open with the EXACT persisted
// salt+vote, DRY_RUN gate, idempotency, and salt-loss → alert + error
// (never a guessed reveal).
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Instruction } from "@solana/kit";
import type { AccordVotingClient, VotingAccounts } from "@useaccord/sdk";

import {
  RevealWindowClosedError,
  SaltLostError,
  revealVote,
  type VoteRecord,
  type VoteStore,
} from "./reveal.ts";

const PROGRAM_ID = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed" as Address;
const JUROR = "Juror111111111111111111111111111111111111111" as Address;
const JUROR_BYTES = new Uint8Array(32).fill(7);
const SALT_HEX = "ab".repeat(32);
const FAKE_IX = { tag: "reveal-ix" } as unknown as Instruction;

function accounts(): VotingAccounts {
  return {
    signer: JUROR,
    subaccord: "Suba111111111111111111111111111111111111111" as Address,
    dispute: "Disp111111111111111111111111111111111111111" as Address,
    round: "Rond111111111111111111111111111111111111111" as Address,
  };
}

function committedRecord(overrides: Partial<VoteRecord> = {}): VoteRecord {
  return {
    dispute: "Disp111111111111111111111111111111111111111",
    roundIdx: 0,
    salt: SALT_HEX,
    vote: "1",
    commitment: "cd".repeat(32),
    committed: true,
    dryRun: false,
    updatedAt: 1_000,
    ...overrides,
  };
}

function makeClient() {
  const built: Array<{ vote: bigint; salt: Uint8Array }> = [];
  const client: AccordVotingClient = {
    encodeAddress: () => JUROR_BYTES,
    buildCommit: () => {
      throw new Error("commit not under test here");
    },
    buildReveal: (input) => {
      built.push({ vote: input.vote, salt: input.salt });
      return FAKE_IX;
    },
    buildFinalizeRound: () => {
      throw new Error("finalizeRound not under test here");
    },
    buildFinalizeDispute: () => {
      throw new Error("finalizeDispute not under test here");
    },
    buildRedraw: () => {
      throw new Error("redraw not under test here");
    },
  };
  return { client, built };
}

function makeStore(seed?: VoteRecord) {
  const records = new Map<string, VoteRecord>();
  if (seed) records.set(`${seed.dispute}:${seed.roundIdx}`, seed);
  const store: VoteStore = {
    load: async (dispute, roundIdx) => records.get(`${dispute}:${roundIdx}`),
    save: async (record) => {
      records.set(`${record.dispute}:${record.roundIdx}`, record);
    },
  };
  return { store, records };
}

function makeDeps(seed?: VoteRecord, now = 2_500) {
  const { client, built } = makeClient();
  const { store, records } = makeStore(seed);
  const sent: Instruction[] = [];
  const notified: string[] = [];
  const deps = {
    client,
    programId: PROGRAM_ID,
    store,
    send: async (ix: Instruction) => {
      sent.push(ix);
      return "fake-reveal-sig";
    },
    notify: async (msg: string) => {
      notified.push(msg);
    },
    now: () => now,
  };
  return { deps, built, records, sent, notified };
}

/** Reveal window [2000, 3000): mirrors reveal.rs gates. */
function plan(overrides: Record<string, unknown> = {}) {
  return {
    accounts: accounts(),
    roundIdx: 0,
    commitEnd: 2_000,
    revealEnd: 3_000,
    allCommitted: false,
    ...overrides,
  };
}

// --- real vs dry-run ------------------------------------------------------------

test("real path: sends the reveal built from the EXACT persisted salt+vote", async () => {
  const { deps, built, records, sent } = makeDeps(committedRecord());
  const result = await revealVote(deps, plan(), false);

  assert.equal(result.sent, true);
  assert.equal(result.signature, "fake-reveal-sig");
  assert.deepEqual(sent, [FAKE_IX]);
  assert.equal(built.length, 1);
  assert.equal(built[0]!.vote, 1n);
  assert.equal(Buffer.from(built[0]!.salt).toString("hex"), SALT_HEX);

  const record = records.get("Disp111111111111111111111111111111111111111:0");
  assert.equal(typeof record?.revealedAt, "number");
});

test("dry-run: instruction built, log+notify instead of tx, not marked revealed", async () => {
  const { deps, built, records, sent, notified } = makeDeps(committedRecord());
  const result = await revealVote(deps, plan(), true);

  assert.equal(result.sent, false);
  assert.equal(result.dryRun, true);
  assert.equal(sent.length, 0);
  assert.equal(built.length, 1); // built from the persisted preimage
  assert.equal(notified.length, 1);
  assert.match(notified[0]!, /dry-run/i);
  assert.equal(records.get("Disp111111111111111111111111111111111111111:0")?.revealedAt, undefined);
});

test("already revealed: no-op, no build, no send", async () => {
  const { deps, built, sent } = makeDeps(committedRecord({ revealedAt: 2_400 }));
  const result = await revealVote(deps, plan(), false);
  assert.equal(result.sent, false);
  assert.equal(result.alreadyRevealed, true);
  assert.equal(built.length, 0);
  assert.equal(sent.length, 0);
});

// --- window edges (mirror reveal.rs) ----------------------------------------------

test("window edges: opens at commitEnd (or all-committed early), closes at revealEnd", async () => {
  const cases: Array<{ now: number; allCommitted: boolean; ok: boolean }> = [
    { now: 1_999, allCommitted: false, ok: false },
    { now: 1_999, allCommitted: true, ok: true }, // reveal.rs early open
    { now: 2_000, allCommitted: false, ok: true },
    { now: 2_999, allCommitted: false, ok: true },
    { now: 3_000, allCommitted: false, ok: false }, // now < reveal_end is strict
    { now: 3_500, allCommitted: false, ok: false },
  ];
  for (const { now, allCommitted, ok } of cases) {
    const { deps, sent } = makeDeps(committedRecord(), now);
    if (ok) {
      const result = await revealVote(deps, plan({ allCommitted }), false);
      assert.equal(result.sent, true, `now=${now} allCommitted=${allCommitted}`);
    } else {
      await assert.rejects(
        () => revealVote(deps, plan({ allCommitted }), false),
        (err: unknown) => err instanceof RevealWindowClosedError,
        `now=${now} allCommitted=${allCommitted} should reject`,
      );
      assert.equal(sent.length, 0);
    }
  }
});

// --- salt loss: alert + abstain, never a guess --------------------------------------

test("salt loss (no record) → alert + SaltLostError, nothing sent", async () => {
  const { deps, built, sent, notified } = makeDeps(); // empty store
  await assert.rejects(() => revealVote(deps, plan(), false), SaltLostError);
  assert.equal(built.length, 0);
  assert.equal(sent.length, 0);
  assert.equal(notified.length, 1);
  assert.match(notified[0]!, /salt/i);
  assert.match(notified[0]!, /Disp1111/);
});

test("uncommitted record → salt loss (a dry-run commit reveals nothing)", async () => {
  const { deps, notified } = makeDeps(committedRecord({ committed: false }));
  await assert.rejects(() => revealVote(deps, plan(), false), SaltLostError);
  assert.equal(notified.length, 1);
});

test("corrupted persisted preimage (bad salt hex, bad vote) → salt loss", async () => {
  for (const overrides of [{ salt: "zz" }, { salt: "ab".repeat(31) }, { vote: "not-a-number" }]) {
    const { deps, notified } = makeDeps(committedRecord(overrides));
    await assert.rejects(() => revealVote(deps, plan(), false), SaltLostError);
    assert.equal(notified.length, 1, JSON.stringify(overrides));
  }
});
