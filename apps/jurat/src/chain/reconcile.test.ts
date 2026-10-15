/**
 * reconcile.test.ts — reconcile-scan unit suite (bean accord-qg1w AC: "unit
 * tests with mocked accounts; missed-event catch-up covered"). Accounts are
 * hand-built fixtures over the seam; the scan is a pure function of chain
 * state, so catch-up is proven by re-scanning after a state transition.
 */

import { beforeEach, describe, expect, test, vi } from "bun:test";
import { address, type Address } from "@solana/kit";
import {
  Aggregation,
  DisputeState,
  ShortfallPolicy,
  type Dispute,
  type Round,
  type Subaccord,
} from "@useaccord/sdk";
import {
  reconcile,
  startReconcileLoop,
  type ReconcileChain,
  type ReconcileResult,
} from "./reconcile.js";

// --- fixtures ---------------------------------------------------------------

const addr = (tail: string): Address => address("1".repeat(31) + tail);

const JUROR = addr("2");
const OTHER_JUROR = addr("3");
const SUB_A = addr("4");
const SUB_B = addr("5");
const DISPUTE_1 = addr("6");
const DISPUTE_2 = addr("7");
const DISPUTE_3 = addr("8");
const DEFAULT_PUBKEY = address("1".repeat(32));

function subaccordFixture(subaccord: Address): Subaccord {
  return {
    discriminator: new Uint8Array(8),
    creator: DEFAULT_PUBKEY,
    stakingToken: addr("9"),
    feeToken: addr("a"),
    minStake: 100n,
    alphaBps: 1_000,
    reviewWindow: 604_800n,
    commitWindow: 172_800n,
    revealWindow: 172_800n,
    appealWindow: 259_200n,
    maxAppeals: 3,
    minJurySize: 3,
    aggregation: Aggregation.Plurality,
    feePerJuror: 0n,
    revealThresholdBps: 6_666,
    shortfallPolicy: ShortfallPolicy.Redraw,
    maxDrawAttempts: 2,
    coherenceTolBps: 0,
    authority: DEFAULT_PUBKEY,
    evidenceOperator: DEFAULT_PUBKEY,
    domainRef: new Uint8Array(32),
    evidenceSpec: new Uint8Array(32),
    jurorCredential: DEFAULT_PUBKEY,
    jurorSchema: DEFAULT_PUBKEY,
    stakerCount: 3,
    rootHash: new Uint8Array(32),
    totalStake: 900n,
    nextIndex: 3,
    depth: 16,
    feeVaultDeposited: 0n,
    feeVaultWithdrawn: 0n,
    stakeVaultDeposited: 900n,
    stakeVaultWithdrawn: 0n,
    freeHead: 0xffff_ffff,
    bump: 255,
    padding: new Uint8Array(64),
  } as Subaccord;
}

function disputeFixture(
  subaccord: Address,
  state: DisputeState,
  currentRound = 0,
): Dispute {
  return {
    discriminator: new Uint8Array(8),
    subaccord,
    filer: DEFAULT_PUBKEY,
    nonce: 0n,
    numOptions: 2,
    options: [new Uint8Array(32), new Uint8Array(32)],
    evidenceHashes: [new Uint8Array(32)],
    state,
    currentRound,
    terms: {
      minStake: 100n,
      alphaBps: 1_000,
      commitWindow: 172_800n,
      revealWindow: 172_800n,
      appealWindow: 259_200n,
      maxAppeals: 3,
      jurySize: 3,
      aggregation: Aggregation.Plurality,
      feePerJuror: 0n,
      reviewWindow: 604_800n,
      revealThresholdBps: 6_666,
      shortfallPolicy: ShortfallPolicy.Redraw,
      maxDrawAttempts: 2,
      coherenceTolBps: 0,
    },
    finalRuling: 0xffff_ffff_ffff_ffffn,
    finalizedAt: 0n,
    feePot: 0n,
    filingBounty: 0n,
    feeVaultDeposited: 0n,
    feeVaultWithdrawn: 0n,
    appealCount: 0,
    drawAttempt: 0,
    bump: 255,
  } as unknown as Dispute;
}

function roundFixture(
  dispute: Address,
  jurors: Address[],
  roundIdx = 0,
): Round {
  return {
    dispute,
    jurors,
    drawAttempt: 0,
    reviewEnd: 0n,
    commitEnd: 0n,
    revealEnd: 0n,
    committed: [],
    commitHashes: [],
    revealed: [],
    revealedVotes: [],
    tally: [],
    bump: 255,
  } as unknown as Round;
}

/** Mutable in-memory chain the tests advance between scans. */
class FakeChain implements ReconcileChain {
  subaccords: Array<{ address: Address; data: Subaccord }> = [];
  disputes: Array<{ address: Address; data: Dispute }> = [];
  rounds = new Map<string, Round>();

  async fetchSubaccords() {
    return this.subaccords;
  }

  async fetchDisputes() {
    return this.disputes;
  }

  async fetchRound(dispute: Address, roundIdx: number): Promise<Round | null> {
    return this.rounds.get(`${dispute}:${roundIdx}`) ?? null;
  }
}

// --- the suite ---------------------------------------------------------------

describe("reconcile", () => {
  let chain: FakeChain;

  beforeEach(() => {
    chain = new FakeChain();
  });

  test("every Subaccord becomes a join candidate", async () => {
    chain.subaccords = [
      { address: SUB_A, data: subaccordFixture(SUB_A) },
      { address: SUB_B, data: subaccordFixture(SUB_B) },
    ];
    const out = await reconcile(chain, JUROR);
    expect(out.joinCandidates.map((c) => c.subaccord)).toEqual([SUB_A, SUB_B]);
    expect(out.duties).toEqual([]);
  });

  test("panel seat in a Commit dispute yields a DutySignal with our index", async () => {
    chain.subaccords = [{ address: SUB_A, data: subaccordFixture(SUB_A) }];
    chain.disputes = [
      { address: DISPUTE_1, data: disputeFixture(SUB_A, DisputeState.Commit) },
    ];
    chain.rounds.set(
      `${DISPUTE_1}:0`,
      roundFixture(DISPUTE_1, [OTHER_JUROR, JUROR, DEFAULT_PUBKEY]),
    );
    const out = await reconcile(chain, JUROR);
    expect(out.duties).toEqual([
      {
        dispute: DISPUTE_1,
        subaccord: SUB_A,
        roundIdx: 0,
        jurorIndex: 1,
        state: DisputeState.Commit,
      },
    ]);
  });

  test("Review and Reveal states are actionable too", async () => {
    chain.disputes = [
      { address: DISPUTE_1, data: disputeFixture(SUB_A, DisputeState.Review) },
      { address: DISPUTE_2, data: disputeFixture(SUB_A, DisputeState.Reveal) },
    ];
    chain.rounds.set(`${DISPUTE_1}:0`, roundFixture(DISPUTE_1, [JUROR]));
    chain.rounds.set(`${DISPUTE_2}:0`, roundFixture(DISPUTE_2, [JUROR]));
    const out = await reconcile(chain, JUROR);
    expect(out.duties.map((d) => d.state)).toEqual([
      DisputeState.Review,
      DisputeState.Reveal,
    ]);
  });

  test("not on the panel ⇒ no duty even in actionable states", async () => {
    chain.disputes = [
      { address: DISPUTE_1, data: disputeFixture(SUB_A, DisputeState.Commit) },
    ];
    chain.rounds.set(
      `${DISPUTE_1}:0`,
      roundFixture(DISPUTE_1, [OTHER_JUROR, DEFAULT_PUBKEY]),
    );
    const out = await reconcile(chain, JUROR);
    expect(out.duties).toEqual([]);
  });

  test("non-actionable states yield no duty even when seated", async () => {
    for (const state of [
      DisputeState.Created,
      DisputeState.Drawn,
      DisputeState.RoundResolved,
      DisputeState.RedrawEligible,
      DisputeState.Final,
      DisputeState.Closed,
      DisputeState.Failed,
    ]) {
      chain.disputes = [
        { address: DISPUTE_1, data: disputeFixture(SUB_A, state) },
      ];
      chain.rounds.set(`${DISPUTE_1}:0`, roundFixture(DISPUTE_1, [JUROR]));
      expect((await reconcile(chain, JUROR)).duties).toEqual([]);
    }
  });

  test("missing round account is skipped, not fatal", async () => {
    chain.disputes = [
      { address: DISPUTE_1, data: disputeFixture(SUB_A, DisputeState.Commit) },
    ];
    // no round stored
    const out = await reconcile(chain, JUROR);
    expect(out.duties).toEqual([]);
  });

  test("appeal round: currentRound drives the round fetch", async () => {
    chain.disputes = [
      {
        address: DISPUTE_1,
        data: disputeFixture(SUB_A, DisputeState.Commit, 2),
      },
    ];
    chain.rounds.set(`${DISPUTE_1}:0`, roundFixture(DISPUTE_1, [JUROR])); // stale round 0
    chain.rounds.set(
      `${DISPUTE_1}:2`,
      roundFixture(DISPUTE_1, [JUROR, OTHER_JUROR], 2),
    );
    const out = await reconcile(chain, JUROR);
    expect(out.duties).toEqual([
      {
        dispute: DISPUTE_1,
        subaccord: SUB_A,
        roundIdx: 2,
        jurorIndex: 0,
        state: DisputeState.Commit,
      },
    ]);
  });

  test("missed-event catch-up: a later scan re-derives duties from state", async () => {
    // Boot scan: dispute just created, no panel yet.
    chain.disputes = [
      { address: DISPUTE_1, data: disputeFixture(SUB_A, DisputeState.Created) },
    ];
    const boot = await reconcile(chain, JUROR);
    expect(boot.duties).toEqual([]);

    // Events were missed; chain advanced to Commit with us seated.
    chain.disputes = [
      { address: DISPUTE_1, data: disputeFixture(SUB_A, DisputeState.Commit) },
    ];
    chain.rounds.set(`${DISPUTE_1}:0`, roundFixture(DISPUTE_1, [JUROR]));
    const caughtUp = await reconcile(chain, JUROR);
    expect(caughtUp.duties.map((d) => d.dispute)).toEqual([DISPUTE_1]);

    // Idempotent: an identical re-scan yields the identical result.
    const again = await reconcile(chain, JUROR);
    expect(again).toEqual(caughtUp);
  });
});

describe("startReconcileLoop", () => {
  test("scans at boot, repeats on the interval, stops on abort", async () => {
    vi.useFakeTimers();
    try {
      const chain = new FakeChain();
      chain.subaccords = [{ address: SUB_A, data: subaccordFixture(SUB_A) }];
      const results: ReconcileResult[] = [];
      // Completion gates: each scan's onResult/onError resolves the pending
      // promise, so assertions await the real signal (never a timer sleep).
      let scanDone = Promise.withResolvers<void>();
      const controller = new AbortController();

      const stop = await startReconcileLoop(chain, JUROR, {
        intervalMs: 60_000,
        signal: controller.signal,
        onResult: (r) => {
          results.push(r);
          scanDone.resolve();
        },
      });
      // Boot scan ran before startReconcileLoop resolved.
      expect(results).toHaveLength(1);

      scanDone = Promise.withResolvers<void>();
      vi.advanceTimersByTime(60_000);
      await scanDone.promise;
      expect(results).toHaveLength(2);

      controller.abort();
      await stop();
      vi.advanceTimersByTime(120_000);
      expect(results).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a failed scan is surfaced and the loop survives to the next tick", async () => {
    vi.useFakeTimers();
    try {
      const chain = new FakeChain();
      chain.subaccords = [{ address: SUB_A, data: subaccordFixture(SUB_A) }];
      let calls = 0;
      const original = chain.fetchSubaccords.bind(chain);
      chain.fetchSubaccords = async () => {
        calls += 1;
        if (calls === 2) throw new Error("rpc hiccup");
        return original();
      };
      const results: ReconcileResult[] = [];
      const errors: unknown[] = [];
      let scanDone = Promise.withResolvers<void>();

      const stop = await startReconcileLoop(chain, JUROR, {
        intervalMs: 1_000,
        onResult: (r) => {
          results.push(r);
          scanDone.resolve();
        },
        onError: (e) => {
          errors.push(e);
          scanDone.resolve();
        },
      });
      expect(results).toHaveLength(1);

      scanDone = Promise.withResolvers<void>();
      vi.advanceTimersByTime(1_000); // tick fails
      await scanDone.promise;
      expect(errors).toHaveLength(1);

      scanDone = Promise.withResolvers<void>();
      vi.advanceTimersByTime(1_000); // tick recovers
      await scanDone.promise;
      expect(results).toHaveLength(2);
      expect(errors).toHaveLength(1);
      await stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
