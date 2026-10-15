// commit.test.ts — unit contract for the vote executor's commit path
// (bean accord-0ytn): dry-run vs real path against a fake client, salt
// persistence/reuse, window-edge rejection, idempotency.
//
// Excluded from the TypeScript build (tsconfig.json exclude); run via:
//   pnpm --filter @useaccord/jurat test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Instruction } from "@solana/kit";
import { commitHash, type AccordVotingClient, type VotingAccounts } from "@useaccord/sdk";

import {
  CommitWindowClosedError,
  SALT_BYTES,
  commitVote,
  type VoteRecord,
  type VoteStore,
} from "./commit.ts";

// --- fixtures ---------------------------------------------------------------

const PROGRAM_ID = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed" as Address;
const JUROR = "Juror111111111111111111111111111111111111111" as Address;
/** Deterministic fake pubkey bytes for `encodeAddress`. */
const JUROR_BYTES = new Uint8Array(32).fill(7);
const FAKE_IX = { tag: "commit-ix" } as unknown as Instruction;

function accounts(): VotingAccounts {
  return {
    signer: JUROR,
    subaccord: "Suba111111111111111111111111111111111111111" as Address,
    dispute: "Disp111111111111111111111111111111111111111" as Address,
    round: "Rond111111111111111111111111111111111111111" as Address,
  };
}

/** Fake SDK client capturing every `buildCommit` input. */
function makeClient() {
  const built: Array<{ commitment: Uint8Array; accounts: VotingAccounts }> = [];
  const client: AccordVotingClient = {
    encodeAddress: () => JUROR_BYTES,
    buildCommit: (input) => {
      built.push({ commitment: input.commitment, accounts: input.accounts });
      return FAKE_IX;
    },
    buildReveal: () => {
      throw new Error("reveal not under test here");
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

/** In-memory VoteStore keyed by `dispute:roundIdx`. */
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

function makeDeps(overrides: Partial<Parameters<typeof commitVote>[0]> = {}) {
  const { client, built } = makeClient();
  const { store, records } = makeStore();
  const sent: Instruction[] = [];
  const notified: string[] = [];
  let now = 1_000;
  let sendImpl: (ix: Instruction) => Promise<string> = async (ix) => {
    sent.push(ix);
    return "fake-signature";
  };
  const deps = {
    client,
    programId: PROGRAM_ID,
    store,
    send: (ix: Instruction) => sendImpl(ix),
    notify: async (msg: string) => {
      notified.push(msg);
    },
    now: () => now,
    ...overrides,
  };
  return {
    deps,
    built,
    records,
    sent,
    notified,
    setNow: (n: number) => (now = n),
    setSend: (impl: (ix: Instruction) => Promise<string>) => (sendImpl = impl),
  };
}

/** Commit window [1000, 2000): mirrors commit.rs `review_end <= now < commit_end`. */
function plan(overrides: Record<string, unknown> = {}) {
  return {
    accounts: accounts(),
    roundIdx: 0,
    vote: 1n,
    numOptions: 3,
    reviewEnd: 1_000,
    commitEnd: 2_000,
    ...overrides,
  };
}

// --- real vs dry-run path ---------------------------------------------------

test("dry-run: no tx, log+notify instead, salt persisted uncommitted", async () => {
  const { deps, built, records, sent, notified } = makeDeps();
  const result = await commitVote(deps, plan(), true);

  assert.equal(result.sent, false);
  assert.equal(result.dryRun, true);
  assert.equal(sent.length, 0); // no vote-shaped tx leaves the process
  assert.equal(built.length, 1); // instruction is still built + hashed
  assert.equal(notified.length, 1);
  assert.match(notified[0]!, /dry-run/i);
  assert.match(notified[0]!, /Disp1111/);

  const record = records.get("Disp111111111111111111111111111111111111111:0");
  assert.ok(record);
  assert.equal(record!.committed, false); // dry run must never mark committed
  assert.equal(record!.dryRun, true);
  assert.equal(record!.salt.length, SALT_BYTES * 2); // 32 B as hex
  assert.match(record!.salt, /^[0-9a-f]+$/);
  assert.equal(record!.vote, "1");
  assert.equal(record!.commitment, result.commitment);
});

test("real path: sends the built instruction exactly once, marks committed, returns signature", async () => {
  const { deps, built, records, sent } = makeDeps();
  const result = await commitVote(deps, plan(), false);

  assert.equal(result.sent, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.signature, "fake-signature");
  assert.deepEqual(sent, [FAKE_IX]); // the exact instruction the SDK built
  assert.equal(built.length, 1);

  const record = records.get("Disp111111111111111111111111111111111111111:0");
  assert.ok(record);
  assert.equal(record!.committed, true);
  assert.equal(record!.dryRun, false);
});

test("commitment is commitHash(vote, persisted salt, juror) — record round-trips", async () => {
  const { deps, records } = makeDeps();
  const result = await commitVote(deps, plan(), false);
  const record = records.get("Disp111111111111111111111111111111111111111:0")!;

  const salt = Buffer.from(record.salt, "hex");
  const expected = Buffer.from(await commitHash(1n, salt, JUROR_BYTES)).toString("hex");
  assert.equal(record.commitment, expected);
  assert.equal(result.commitment, expected);
});

test("send failure: record stays persisted uncommitted (salt survives for retry)", async () => {
  const { deps, records } = makeDeps({
    send: async () => {
      throw new Error("rpc down");
    },
  });
  await assert.rejects(() => commitVote(deps, plan(), false), /rpc down/);

  const record = records.get("Disp111111111111111111111111111111111111111:0");
  assert.ok(record);
  assert.equal(record!.committed, false);
});

test("retry after failure reuses the persisted salt → identical commitment", async () => {
  const ctx = makeDeps();
  ctx.setSend(async () => {
    throw new Error("rpc down");
  });
  await assert.rejects(() => commitVote(ctx.deps, plan(), false), /rpc down/);

  const signatures: string[] = [];
  ctx.setSend(async () => {
    signatures.push("retry-sig");
    return "retry-sig";
  });
  const result = await commitVote(ctx.deps, plan(), false);

  assert.equal(result.sent, true);
  assert.equal(result.signature, "retry-sig");
  assert.equal(ctx.built.length, 2);
  assert.deepEqual(
    Buffer.from(ctx.built[0]!.commitment).toString("hex"),
    Buffer.from(ctx.built[1]!.commitment).toString("hex"),
  );
});

test("dry-run then real: real pass reuses the dry-run salt, no double build drift", async () => {
  const { deps, built, sent } = makeDeps();
  await commitVote(deps, plan(), true);
  const result = await commitVote(deps, plan(), false);

  assert.equal(sent.length, 1); // only the real pass sends
  assert.equal(built.length, 2);
  assert.equal(
    Buffer.from(built[0]!.commitment).toString("hex"),
    Buffer.from(built[1]!.commitment).toString("hex"),
  );
  assert.equal(result.dryRun, false);
});

// --- window edges -------------------------------------------------------------

test("window edges: opens at reviewEnd, closes at commitEnd (exclusive)", async () => {
  const cases: Array<{ now: number; ok: boolean }> = [
    { now: 999, ok: false }, // before review_end → commit window closed
    { now: 1_000, ok: true }, // review_end itself: inclusive open
    { now: 1_999, ok: true },
    { now: 2_000, ok: false }, // commit_end itself: exclusive close
    { now: 2_500, ok: false },
  ];
  for (const { now, ok } of cases) {
    const { deps, sent, records } = makeDeps({ now: () => now });
    if (ok) {
      const result = await commitVote(deps, plan(), false);
      assert.equal(result.sent, true, `now=${now} should be inside the window`);
      assert.equal(sent.length, 1);
    } else {
      await assert.rejects(
        () => commitVote(deps, plan(), false),
        (err: unknown) =>
          err instanceof CommitWindowClosedError &&
          err.now === now &&
          err.reviewEnd === 1_000 &&
          err.commitEnd === 2_000,
        `now=${now} should reject`,
      );
      assert.equal(sent.length, 0, "no tx on a closed window");
      assert.equal(records.size, 0, "nothing persisted on a closed window");
    }
  }
});

// --- idempotency + vote validation -------------------------------------------

test("already-committed duty is a no-op: no build, no send", async () => {
  const seeded: VoteRecord = {
    dispute: "Disp111111111111111111111111111111111111111",
    roundIdx: 0,
    salt: "ab".repeat(32),
    vote: "1",
    commitment: "cd".repeat(32),
    committed: true,
    dryRun: false,
    updatedAt: 900,
  };
  const { deps, built, sent } = makeDeps();
  const { store } = makeStore(seeded);
  deps.store = store;

  const result = await commitVote(deps, plan(), false);
  assert.equal(result.sent, false);
  assert.equal(result.alreadyCommitted, true);
  assert.equal(result.commitment, seeded.commitment);
  assert.equal(built.length, 0);
  assert.equal(sent.length, 0);
});

test("out-of-range option index is rejected before any persistence", async () => {
  const { deps, records } = makeDeps();
  await assert.rejects(() => commitVote(deps, plan({ vote: 3n }), false), /InvalidVote/);
  await assert.rejects(() => commitVote(deps, plan({ vote: -1n }), false), /InvalidVote/);
  assert.equal(records.size, 0);
});
