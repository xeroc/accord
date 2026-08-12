/**
 * reconciler.test.ts — unit tests for the poll loop (bean accord-bpag).
 *
 * The dispute + round fetchers are injected, so the cycle runs with no validator.
 * Covers: terminal skip, current-round resolution, prior-round settlement scan,
 * per-dispatch-handler invocation, and unhandled-action logging.
 */
import { test, expect } from "bun:test";
import { address, type Account } from "@solana/kit";
import {
  Accord,
  Aggregation,
  DisputeState,
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
    },
    finalRuling: 255,
    finalizedAt: 0n,
    feePaid: 0n,
    committedVrf: { __option: "None" },
    frozenRoot: Z32,
    frozenTotalStake: 0n,
    filedAt: 0n,
    bump: 0,
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
    reviewEnd: 0n,
    commitEnd: 0n,
    revealEnd: 10_000n,
    result: 255,
    bump: 0,
    pad0: new Uint8Array(2),
    dispute: D_ADDR,
    jurors: new Array(31).fill(address("11111111111111111111111111111111")),
    commits: new Array(31).fill(Z32),
    reveals: new Uint8Array(31).fill(255),
    settled: 0,
    pad1: new Uint8Array(4),
    seatPrefix: new Array(31).fill(0n),
    seatStake: new Array(31).fill(0n),
    drawAttempt: 0,
    padDrawAttempt: new Uint8Array(4),
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
    fetchPauseState: async () => null,
    fetchReclaimableSlots: async () => [],
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
