/**
 * reconciler.test.ts — unit tests for the poll loop (bean accord-bpag).
 *
 * The dispute + round fetchers are injected, so the cycle runs with no validator.
 * Covers: terminal skip, current-round resolution, prior-round settlement scan,
 * per-dispatch-handler invocation, unhandled-action logging, the Canon item
 * phase (bean accord-7fj6: advance_pending / settle_item / advance_withdrawal),
 * and the Synod case phase (bean accord-i1mp: file_dispute /
 * refund_roster_miss / claim).
 */
import { test, expect } from "bun:test";
import { address, type Account } from "@solana/kit";
import { ItemState, type CanonItem, type CanonList } from "@useaccord/canon";
import { CaseState, type SynodCase } from "@useaccord/synod";
import {
  Accord,
  Aggregation,
  DisputeState,
  NO_RULING,
  NO_VOTE,
  ShortfallPolicy,
  type Dispute,
  type Round,
} from "@useaccord/sdk";

import { createCrankDispatch, type CrankAction, type CrankContext } from "./dispatch.js";
import { reconcileOnce, type ReconcilerConfig } from "./reconciler.js";
import type { CrankerWallet } from "./wallet.js";

const Z32 = new Uint8Array(32);
const D_ADDR = address("Dispute111111111111111111111111111111111111");
const R_ADDR = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function dispute(over: Partial<Dispute> & Pick<Dispute, "state"> = {} as never): Dispute {
  return {
    discriminator: new Uint8Array(8),
    subaccord: address("11111111111111111111111111111111"),
    filer: address("11111111111111111111111111111111"),
    nonce: 0n,
    numOptions: 2,
    options: [Z32, Z32],
    evidenceHashes: [Z32, Z32, Z32, Z32],
    currentRound: 0,
    terms: {
      alphaBps: 1_000,
      minStake: 1_000n,
      feePerJuror: 0n,
      reviewWindow: 0n,
      commitWindow: 0n,
      revealWindow: 0n,
      appealWindow: 100n,
      maxAppeals: 3,
      minJurySize: 3,
      aggregation: Aggregation.Plurality,
      revealThresholdBps: 6_666,
      shortfallPolicy: ShortfallPolicy.Redraw,
      maxDrawAttempts: 3,
      coherenceTolBps: 0,
    },
    finalRuling: NO_RULING,
    finalizedAt: 0n,
    feePaid: 0n,
    committedVrf: { __option: "None" },
    frozenRoot: Z32,
    frozenTotalStake: 0n,
    filedAt: 0n,
    bump: 0,
    padding: new Uint8Array(64),
    ...over,
  };
}

function round(over: Partial<Round> = {}): Round {
  return {
    discriminator: new Uint8Array(8),
    roundIdx: 0,
    jurorCount: 0,
    commitCount: 0,
    revealCount: 0,
    drawAttempt: 0,
    settled: 0,
    bump: 0,
    pad0: new Uint8Array(2),
    reviewEnd: 0n,
    commitEnd: 0n,
    revealEnd: 10_000n,
    result: NO_VOTE,
    dispute: D_ADDR,
    jurors: new Array(31).fill(address("11111111111111111111111111111111")),
    commits: new Array(31).fill(Z32),
    seatPrefix: new Array(31).fill(0n),
    seatStake: new Array(31).fill(0n),
    reveals: new Array(31).fill(NO_VOTE),
    ...over,
  };
}

const FAKE_WALLET = {
  signer: { address: D_ADDR },
  address: D_ADDR,
  balanceLamports: 0n,
} as unknown as CrankerWallet;

/** A dispatch that records every action its handlers see. */
function recordingDispatch(
  register: Record<string, (ctx: CrankContext, a: CrankAction) => Promise<void>>,
) {
  const d = createCrankDispatch();
  const calls: CrankAction[] = [];
  for (const [kind, fn] of Object.entries(register)) {
    d.register(kind as CrankAction["kind"], async (ctx, a) => {
      calls.push(a);
      await fn(ctx, a);
    });
  }
  return { d, calls };
}

function config(
  over: Partial<ReconcilerConfig> &
    Pick<ReconcilerConfig, "dispatch" | "fetchDisputes" | "fetchRound">,
): ReconcilerConfig {
  return {
    accord: {} as unknown as Accord,
    rpcSubscriptions: {} as ReconcilerConfig["rpcSubscriptions"],
    wallet: FAKE_WALLET,
    oracleQueue: D_ADDR,
    programIdentity: D_ADDR,
    now: () => 1n,
    fetchPendingUpdates: async () => [],
    slot: async () => 0n,
    fetchAccordState: async () => null,
    fetchReclaimableSlots: async () => [],
    fetchCanonItems: async () => [],
    fetchCanonLists: async () => [],
    fetchSynodCases: async () => [],
    ...over,
  };
}

test("Created dispute without VRF → request_vrf dispatched + logged", async () => {
  const { d, calls } = recordingDispatch({
    request_vrf: async () => {},
  });
  const logs: string[] = [];
  const d2 = dispute({ state: DisputeState.Created });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [{ address: D_ADDR, data: d2 } as unknown as Account<Dispute>],
      fetchRound: async () => null,
      log: (msg, fields = {}) => logs.push(JSON.stringify({ msg, ...fields })),
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "request_vrf", dispute: D_ADDR }]);
  expect(logs.some((l) => l.includes("crank action") && l.includes("request_vrf"))).toBe(true);
});

test("Closed disputes are skipped; Failed with no appeals is a no-op", async () => {
  const { d, calls } = recordingDispatch({ cancel_dispute: async () => {} });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [
        {
          address: D_ADDR,
          data: dispute({ state: DisputeState.Closed }),
        } as unknown as Account<Dispute>,
        {
          address: D_ADDR,
          data: dispute({ state: DisputeState.Failed }),
        } as unknown as Account<Dispute>,
      ],
      fetchRound: async () => null,
    }),
  );
  expect(fired).toBe(0);
  expect(calls).toEqual([]);
});

test("Final dispute settles its prior unsettled round after the current round yields nothing", async () => {
  const { d, calls } = recordingDispatch({ settle_round: async () => {} });
  // currentRound = 2 (Final). Round 0 settled, round 1 unsettled.
  const d2 = dispute({ state: DisputeState.Final, currentRound: 2 });
  const fetched: Record<number, Round> = {
    0: round({ roundIdx: 0, settled: 1 }),
    1: round({ roundIdx: 1, settled: 0 }),
    2: round({ roundIdx: 2, settled: 0 }),
  };
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [{ address: D_ADDR, data: d2 } as unknown as Account<Dispute>],
      fetchRound: async (_addr, idx) =>
        ({ address: R_ADDR, data: fetched[idx]! }) as unknown as Account<Round>,
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "settle_round", roundIdx: 1, dispute: D_ADDR }]);
});

test("One action per dispute per cycle — current round wins over prior rounds", async () => {
  const { d, calls } = recordingDispatch({
    finalize_round: async () => {},
    settle_round: async () => {},
  });
  // Drawn (current round actionable) AND Final-eligible? No — pick Drawn so the
  // current-round path resolves first; prior-round scan must NOT also run.
  const d2 = dispute({ state: DisputeState.Drawn, currentRound: 1 });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      now: () => 11_000n, // past revealEnd → finalize_round
      fetchDisputes: async () => [{ address: D_ADDR, data: d2 } as unknown as Account<Dispute>],
      fetchRound: async (_addr, idx) =>
        idx === 1
          ? ({ address: R_ADDR, data: round({ roundIdx: 1 }) } as unknown as Account<Round>)
          : null,
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "finalize_round", dispute: D_ADDR }]);
});

test("Unhandled action kind is logged + skipped (fired stays 0)", async () => {
  const { d, calls } = recordingDispatch({}); // no handlers
  const logs: string[] = [];
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [
        {
          address: D_ADDR,
          data: dispute({ state: DisputeState.RedrawEligible }),
        } as unknown as Account<Dispute>,
      ],
      fetchRound: async () => null,
      log: (msg, fields = {}) => logs.push(JSON.stringify({ msg, ...fields })),
    }),
  );
  expect(fired).toBe(0);
  expect(calls).toEqual([]);
  expect(logs.some((l) => l.includes("redraw") && l.includes('"handled":false'))).toBe(true);
});

test("reconcileOnce returns the count of handled actions across multiple disputes", async () => {
  const { d } = recordingDispatch({ request_vrf: async () => {} });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [
        {
          address: D_ADDR,
          data: dispute({ state: DisputeState.Created }),
        } as unknown as Account<Dispute>,
        {
          address: D_ADDR,
          data: dispute({ state: DisputeState.RedrawEligible }),
        } as unknown as Account<Dispute>,
        {
          address: D_ADDR,
          data: dispute({ state: DisputeState.Closed }),
        } as unknown as Account<Dispute>,
      ],
      fetchRound: async () => null,
    }),
  );
  // Created → request_vrf (handled); RedrawEligible → redraw (no handler);
  // Closed skipped. Only one handler ran.
  expect(fired).toBe(1);
});

// --- Canon item phase (bean accord-7fj6) -----------------------------------

const CANON_ITEM_ADDR = address("Canon11111111111111111111111111111111111111");
const CANON_LIST_ADDR = address("List111111111111111111111111111111111111111");
const WINDOW = 432_000n; // 5 days, matches the fixtures below

function canonList(over: Partial<CanonList> = {}): CanonList {
  return {
    discriminator: new Uint8Array(8),
    creator: address("11111111111111111111111111111111"),
    stakeMint: address("11111111111111111111111111111111"),
    feeMint: address("11111111111111111111111111111111"),
    listProgram: address("11111111111111111111111111111111"),
    rulesHash: Z32,
    subaccord: address("11111111111111111111111111111111"),
    submitDeposit: 500n,
    challengePct: 5_000,
    listingWindow: WINDOW,
    withdrawalTimelock: WINDOW,
    authority: CANON_LIST_ADDR,
    itemCount: 1,
    disputeCount: 0n,
    bump: 0,
    ...over,
  };
}

function canonItem(over: Partial<CanonItem> = {}): CanonItem {
  return {
    discriminator: new Uint8Array(8),
    account: address("11111111111111111111111111111111"),
    list: CANON_LIST_ADDR,
    submitter: address("11111111111111111111111111111111"),
    state: ItemState.Pending,
    accumulatedStake: 500n,
    submittedAt: 0n,
    challengeCount: 0,
    activeDispute: address("11111111111111111111111111111111"),
    challenger: address("11111111111111111111111111111111"),
    challengeStake: 0n,
    challengedAt: 0n,
    withdrawalRequestedAt: { __option: "None" },
    bump: 0,
    ...over,
  };
}

test("canon: Pending item past listing_window → advance_pending dispatched", async () => {
  const { d, calls } = recordingDispatch({ canon_advance_pending: async () => {} });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [],
      fetchRound: async () => null,
      now: () => WINDOW, // submittedAt 0 + window → elapsed
      fetchCanonItems: async () => [
        {
          address: CANON_ITEM_ADDR,
          data: canonItem({ state: ItemState.Pending }),
        } as Account<CanonItem>,
      ],
      fetchCanonLists: async () => [
        { address: CANON_LIST_ADDR, data: canonList() } as Account<CanonList>,
      ],
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "canon_advance_pending", item: CANON_ITEM_ADDR }]);
});

test("canon: Disputed item whose dispute is Final → settle_item; open dispute → nothing", async () => {
  const { d, calls } = recordingDispatch({ canon_settle_item: async () => {} });
  const finalDispute = dispute({ state: DisputeState.Final });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [
        { address: D_ADDR, data: finalDispute } as unknown as Account<Dispute>,
      ],
      fetchRound: async () => null,
      fetchCanonItems: async () => [
        // activeDispute = D_ADDR (Final) → settle
        {
          address: CANON_ITEM_ADDR,
          data: canonItem({ state: ItemState.Disputed, activeDispute: D_ADDR }),
        } as Account<CanonItem>,
        // activeDispute unknown to the cycle → not final → nothing
        {
          address: CANON_ITEM_ADDR,
          data: canonItem({ state: ItemState.Disputed, activeDispute: R_ADDR }),
        } as Account<CanonItem>,
      ],
      fetchCanonLists: async () => [
        { address: CANON_LIST_ADDR, data: canonList() } as Account<CanonList>,
      ],
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "canon_settle_item", item: CANON_ITEM_ADDR }]);
});

test("canon: WithdrawPending past timelock → advance_withdrawal; item without list skipped", async () => {
  const { d, calls } = recordingDispatch({ canon_advance_withdrawal: async () => {} });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [],
      fetchRound: async () => null,
      now: () => WINDOW + 1n,
      fetchCanonItems: async () => [
        {
          address: CANON_ITEM_ADDR,
          data: canonItem({
            state: ItemState.WithdrawPending,
            withdrawalRequestedAt: { __option: "Some", value: 1n },
          }),
        } as Account<CanonItem>,
        // list missing from the list fetch → skipped, no crash
        {
          address: CANON_ITEM_ADDR,
          data: canonItem({
            list: R_ADDR,
            state: ItemState.WithdrawPending,
            withdrawalRequestedAt: { __option: "Some", value: 1n },
          }),
        } as Account<CanonItem>,
      ],
      fetchCanonLists: async () => [
        { address: CANON_LIST_ADDR, data: canonList() } as Account<CanonList>,
      ],
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "canon_advance_withdrawal", item: CANON_ITEM_ADDR }]);
});

// --- Synod case phase (bean accord-i1mp) -------------------------------------

const CASE_ADDR = address("Case111111111111111111111111111111111111111");

function synodCase(over: Partial<SynodCase> & Pick<SynodCase, "state"> = {} as never): SynodCase {
  return {
    discriminator: new Uint8Array(8),
    subaccord: address("11111111111111111111111111111111"),
    parties: [
      address("11111111111111111111111111111112"),
      address("11111111111111111111111111111113"),
      address("11111111111111111111111111111111"),
      address("11111111111111111111111111111111"),
      address("11111111111111111111111111111111"),
      address("11111111111111111111111111111111"),
      address("11111111111111111111111111111111"),
    ],
    partyCount: 2,
    joined: 0b11,
    stake: 1_000n,
    fee: 30n,
    joinDeadline: 0n,
    evidence: new Array(7).fill(new Uint8Array(32)),
    dispute: D_ADDR,
    paidOut: 0,
    bump: 0,
    ...over,
  };
}

test("synod: Opening case with full roster → synod_file_dispute dispatched", async () => {
  const { d, calls } = recordingDispatch({ synod_file_dispute: async () => {} });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [],
      fetchRound: async () => null,
      fetchSynodCases: async () => [
        { address: CASE_ADDR, data: synodCase({ state: CaseState.Opening }) } as Account<SynodCase>,
      ],
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "synod_file_dispute", case: CASE_ADDR }]);
});

test("synod: Opening case past deadline, partial roster → refund first joined-unpaid party", async () => {
  const { d, calls } = recordingDispatch({ synod_refund_roster_miss: async () => {} });
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      now: () => 10_000n,
      fetchDisputes: async () => [],
      fetchRound: async () => null,
      fetchSynodCases: async () => [
        {
          address: CASE_ADDR,
          data: synodCase({ state: CaseState.Opening, joined: 0b01, joinDeadline: 10_000n }),
        } as Account<SynodCase>,
      ],
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "synod_refund_roster_miss", case: CASE_ADDR, partyIndex: 0 }]);
});

test("synod: Live case with Final dispute, winner = party 1 → claim party 1; still-resolving dispute → nothing", async () => {
  const { d, calls } = recordingDispatch({ synod_claim: async () => {} });
  const finalWinner = dispute({ state: DisputeState.Final, finalRuling: 1n });
  const resolving = dispute({ state: DisputeState.Reveal });
  const OTHER_CASE = address("Case11111111111111111111111111111111111111a");
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [
        { address: D_ADDR, data: finalWinner } as unknown as Account<Dispute>,
        { address: R_ADDR, data: resolving } as unknown as Account<Dispute>,
      ],
      fetchRound: async () => null,
      fetchSynodCases: async () => [
        // dispute bound + Final, winner slot 1 unpaid → claim
        {
          address: CASE_ADDR,
          data: synodCase({ state: CaseState.Live, dispute: D_ADDR }),
        } as Account<SynodCase>,
        // dispute still resolving → nothing due, no action
        {
          address: OTHER_CASE,
          data: synodCase({ state: CaseState.Live, dispute: R_ADDR }),
        } as Account<SynodCase>,
      ],
    }),
  );
  expect(fired).toBe(1);
  expect(calls).toEqual([{ kind: "synod_claim", case: CASE_ADDR, partyIndex: 1 }]);
});

test("synod: unregistered synod kind → logged + skipped, fired stays 0", async () => {
  const { d, calls } = recordingDispatch({}); // no synod handler registered
  const fired = await reconcileOnce(
    config({
      dispatch: d,
      fetchDisputes: async () => [],
      fetchRound: async () => null,
      fetchSynodCases: async () => [
        { address: CASE_ADDR, data: synodCase({ state: CaseState.Opening }) } as Account<SynodCase>,
      ],
    }),
  );
  expect(fired).toBe(0);
  expect(calls).toEqual([]);
});
