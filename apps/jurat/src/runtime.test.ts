/**
 * runtime.test.ts — unit tests for the daemon runtime (bean accord-vruh):
 * the join half of a scan (gate decisions logged, executor invoked once per
 * pass) and the duty state machine (verdict → commit → reveal, ladder
 * abstain, evidence hold, window-closed). All seams faked; state files on a
 * tmp dir (the book is load-bearing for budget accounting).
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, type Address } from "@solana/kit";
import {
  Aggregation,
  DisputeState,
  type Dispute,
  type Round,
  type Subaccord,
} from "@useaccord/sdk";

import { handleScan, runDuty, joinPolicyFromConfig, joinBudgetFromConfig } from "./runtime";
import type { RuntimeDeps, RuntimeChain } from "./runtime";
import { RetryLadderExhaustedError } from "./agent/provider";
import { MalformedVerdictError, type AgentContext } from "./agent/runner";
import { EvidenceUnavailableError } from "./duty/evidence";
import type { DutyRecord, DutyStore } from "./duty/types";
import type { DutySignal, JoinCandidate, ReconcileResult } from "./chain/reconcile";
import type { JoinOutcome as ExecOutcome } from "./join/executor";
import type { Config } from "./config";

const JUROR = address("Jura111111111111111111111111111111111111111");
const OTHER = address("1".repeat(31) + "2") as Address;
const SUB = address("Suba111111111111111111111111111111111111111");
const DISPUTE = address("Disp111111111111111111111111111111111111111");
const MINT = address("Mint111111111111111111111111111111111111111");

// --- fixtures -----------------------------------------------------------------

function subFixture(overrides: Partial<Subaccord> = {}): Subaccord {
  return {
    stakingToken: MINT,
    feeToken: MINT,
    minStake: 1n,
    feePerJuror: 10n,
    alphaBps: 100,
    aggregation: Aggregation.Plurality,
    commitWindow: 3_600n,
    jurorCredential: address("1".repeat(32)),
    jurorSchema: address("1".repeat(32)),
    ...overrides,
  } as Subaccord;
}

function disputeFixture(state: DisputeState): Dispute {
  return {
    subaccord: SUB,
    state,
    currentRound: 0,
    numOptions: 2,
  } as Dispute;
}

function roundFixture(overrides: Partial<Round> = {}): Round {
  return {
    dispute: DISPUTE,
    roundIdx: 0,
    drawAttempt: 0,
    jurorCount: 2,
    jurors: [JUROR, OTHER],
    commitCount: 0,
    reviewEnd: 1_000n,
    commitEnd: 2_000n,
    revealEnd: 3_000n,
    ...overrides,
  } as Round;
}

function memDutyStore(seed?: DutyRecord): DutyStore {
  const records = new Map<string, DutyRecord>();
  if (seed) records.set(`${seed.dispute}:${seed.roundIdx}`, seed);
  return {
    load: async (d, r) => records.get(`${d}:${r}`),
    save: async (rec) => void records.set(`${rec.dispute}:${rec.roundIdx}`, rec),
  };
}

function memVoteStore(seed?: VoteRecord): VoteStore {
  const records = new Map<string, VoteRecord>();
  if (seed) records.set(`${seed.dispute}:${seed.roundIdx}`, seed);
  return {
    load: async (d, r) => records.get(`${d}:${r}`),
    save: async (rec) => void records.set(`${rec.dispute}:${rec.roundIdx}`, rec),
  };
}

interface Recording {
  logs: string[];
  alerts: string[];
  verdicts: VerdictNotice[];
  joins: JoinCandidate[];
  sends: number[];
  dutyWrites: DutyRecord[];
}

function recordingChannel(rec: Recording): NotifyChannel {
  return {
    alert: async (message) => void rec.alerts.push(message),
    verdict: async (notice) => void rec.verdicts.push(notice),
  };
}

type RuntimeOverrides = Partial<Omit<RuntimeDeps, "chain">> & {
  chain?: Partial<RuntimeChain>;
};

function makeDeps(overrides: RuntimeOverrides = {}): { deps: RuntimeDeps; rec: Recording } {
  const rec: Recording = {
    logs: [],
    alerts: [],
    verdicts: [],
    joins: [],
    sends: [],
    dutyWrites: [],
  };
  const chain: RuntimeChain = {
    fetchSubaccords: async () => [],
    fetchDisputes: async () => [],
    fetchRound: async () => null,
    fetchDispute: async () => null,
    ...overrides.chain,
  };
  const deps: RuntimeDeps = {
    juror: JUROR,
    stateDir: dir,
    dryRun: false,
    policy: {
      stakingTokenAllowlist: new Set([MINT]),
      feeTokenAllowlist: new Set([MINT]),
      minStakeRange: { min: 0n, max: 1_000_000n },
      feePerJurorRange: { min: 0n, max: 10_000n },
      alphaBpsCap: 2_000,
      commitWindowFloorSecs: 600n,
      stakeAmount: 1_000n,
      globalStakeBudget: 100_000n,
      perSubaccordCap: 50_000n,
      reserveFloor: 1_000n,
    },
    join: async (candidate) => {
      rec.joins.push(candidate);
      return { status: "joined", subaccord: candidate.subaccord, amount: 1_000n, signature: "sig" };
    },
    chain,
    store: memDutyStore(),
    votes: memVoteStore(),
    channel: recordingChannel(rec),
    verdict: async () => ({ optionIndex: 1, rationale: "clear", confidence: 0.9 }),
    assembleContext: async () => ({}) as AgentContext,
    voting: {
      client: {
        encodeAddress: () => new Uint8Array(32).fill(7),
        buildCommit: () => ({ tag: "commit-ix" }) as never,
        buildReveal: () => ({ tag: "reveal-ix" }) as never,
        buildFinalizeRound: () => {
          throw new Error("not under test");
        },
        buildFinalizeDispute: () => {
          throw new Error("not under test");
        },
        buildRedraw: () => {
          throw new Error("not under test");
        },
      } as never,
      programId: address("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed"),
      send: async () => {
        rec.sends.push(rec.sends.length);
        return "sig";
      },
    },
    now: async () => 1_500,
    log: (m) => void rec.logs.push(m),
    ...overrides,
  };
  return { deps, rec };
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jurat-runtime-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("joinPolicyFromConfig / joinBudgetFromConfig carry every config knob", () => {
  const config = {
    joinGates: {
      stakingTokens: [MINT],
      feeTokens: [MINT],
      stakeAmount: 5_000n,
      minStakeMin: 1n,
      minStakeMax: 9n,
      feePerJurorMin: 2n,
      feePerJurorMax: 8n,
      alphaBpsCap: 1_500,
      commitWindowFloorSec: 600,
      stakeBudget: 100_000n,
      subaccordCap: 50_000n,
      reserveFloor: 1_000n,
    },
    minSolLamports: 50_000_000n,
  } as unknown as Config;
  const policy = joinPolicyFromConfig(config);
  const budget = joinBudgetFromConfig(config);
  expect(policy.minStakeRange).toEqual({ min: 1n, max: 9n });
  expect(policy.feePerJurorRange).toEqual({ min: 2n, max: 8n });
  expect(policy.commitWindowFloorSecs).toBe(600n);
  expect(policy.stakeAmount).toBe(5_000n);
  expect(policy.stakingTokenAllowlist.has(MINT)).toBe(true);
  expect(budget).toEqual({
    stakeAmount: 5_000n,
    globalStakeBudget: 100_000n,
    perSubaccordCap: 50_000n,
    reserveFloor: 1_000n,
    minSolLamports: 50_000_000n,
  });
});

test("joinPolicyFromConfig: unset range maxima are unbounded", () => {
  const config = {
    joinGates: {
      stakingTokens: [],
      feeTokens: [],
      stakeAmount: 1n,
      minStakeMin: 0n,
      feePerJurorMin: 0n,
      alphaBpsCap: 2000,
      commitWindowFloorSec: 600,
      stakeBudget: 1n,
      subaccordCap: 1n,
      reserveFloor: 0n,
    },
    minSolLamports: 0n,
  } as unknown as Config;
  const policy = joinPolicyFromConfig(config);
  expect(policy.minStakeRange.max).toBeGreaterThan(2n ** 64n);
  expect(policy.feePerJurorRange.max).toBeGreaterThan(2n ** 64n);
});

// --- handleScan: joins ----------------------------------------------------------

function scanResult(candidates: JoinCandidate[], duties: DutySignal[] = []): ReconcileResult {
  return { joinCandidates: candidates, duties };
}

function candidate(sub: Subaccord, addr: Address = SUB): JoinCandidate {
  return { subaccord: addr, data: sub };
}

test("gate-pass → executor invoked once; outcome logged", async () => {
  const { deps, rec } = makeDeps();
  await handleScan(deps, scanResult([candidate(subFixture())]));
  expect(rec.joins.map((c) => c.subaccord)).toEqual([SUB]);
  expect(rec.logs.some((l) => l.includes("joined") && l.includes("sig"))).toBe(true);
});

test("gate-reject → logged with reason, executor never called", async () => {
  const { deps, rec } = makeDeps();
  const bad = subFixture({ alphaBps: 9_999 });
  await handleScan(
    deps,
    scanResult([candidate(bad, address("Bad1111111111111111111111111111111111111111"))]),
  );
  expect(rec.joins).toHaveLength(0);
  expect(rec.logs.some((l) => l.includes("AlphaTooHigh"))).toBe(true);
});

test("executor reject outcome is logged, scan continues", async () => {
  const joins: Address[] = [];
  const { deps, rec } = makeDeps({
    join: async (c) => {
      joins.push(c.subaccord);
      return {
        status: "rejected",
        subaccord: c.subaccord,
        reason: "InsufficientTokenBalance",
        detail: "poor",
      } as unknown as ExecOutcome;
    },
  });
  const other = candidate(subFixture(), address("1".repeat(31) + "3") as Address);
  await handleScan(deps, scanResult([other]));
  expect(joins).toHaveLength(1);
  expect(rec.logs.some((l) => l.includes("InsufficientTokenBalance"))).toBe(true);
});

test("executor throw is caught and logged, never kills the scan", async () => {
  const { deps, rec } = makeDeps({
    join: async () => {
      throw new Error("AccumulatorRootMismatch: stale");
    },
  });
  await handleScan(deps, scanResult([candidate(subFixture())]));
  expect(rec.logs.some((l) => l.includes("AccumulatorRootMismatch"))).toBe(true);
});

// --- runDuty: state machine -----------------------------------------------------

function dutySignal(state = DisputeState.Commit): DutySignal {
  return { dispute: DISPUTE, subaccord: SUB, roundIdx: 0, jurorIndex: 0, state };
}

function dutyChain(round: Round, dispute: Dispute): Partial<RuntimeChain> {
  return {
    fetchRound: async () => round,
    fetchDispute: async () => dispute,
  };
}

/** JoinChain-shaped reader for the Subaccord fetch runDuty does (domainRef). */
function subReader(sub: Subaccord) {
  return { fetchSubaccord: async () => sub } as unknown as RuntimeDeps["joinChain"];
}

test("open duty in commit phase → verdict → commit → notice; record committed", async () => {
  const { deps, rec } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Commit)),
    joinChain: subReader(subFixture()) as never,
  });
  await runDuty(deps, dutySignal());
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("committed");
  expect(rec.sends).toHaveLength(1); // the commit tx
  expect(rec.verdicts).toHaveLength(1);
  expect(rec.verdicts[0]).toMatchObject({ dispute: DISPUTE, option: 1, dryRun: false });
});

test("open duty in review phase → no verdict, no tx (agent waits for the window)", async () => {
  const { deps, rec } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Review)),
    now: async () => 500, // < reviewEnd 1000
  });
  await runDuty(deps, dutySignal(DisputeState.Review));
  expect(rec.sends).toHaveLength(0);
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("open");
});

test("ladder exhausted → abstain retry-ladder-exhausted; no vote tx", async () => {
  const { deps, rec } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Commit)),
    verdict: async () => {
      throw new RetryLadderExhaustedError(["m#1: down"], new Error("down"));
    },
  });
  await runDuty(deps, dutySignal());
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("abstained");
  expect(record?.failure?.kind).toBe("retry-ladder-exhausted");
  expect(rec.sends).toHaveLength(0);
  expect(rec.alerts.some((a) => a.includes("abstained") && a.includes(DISPUTE))).toBe(true);
});

test("malformed verdict → abstain malformed-verdict; no vote tx", async () => {
  const { deps, rec } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Commit)),
    verdict: async () => {
      throw new MalformedVerdictError("optionIndex 5 ≥ numOptions 2");
    },
  });
  await runDuty(deps, dutySignal());
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.failure?.kind).toBe("malformed-verdict");
  expect(rec.sends).toHaveLength(0);
});

test("evidence unavailable → duty HELD open (retried next scan), no abstain yet", async () => {
  const { deps, rec } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Commit)),
    assembleContext: async () => {
      throw new EvidenceUnavailableError("daemon 502");
    },
  });
  await runDuty(deps, dutySignal());
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("open");
  expect(rec.sends).toHaveLength(0);
  expect(rec.alerts).toHaveLength(0);
});

test("no evidence wiring → duty held; a dry-run-persisted verdict is never re-rolled", async () => {
  const vote: VoteRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    salt: "ab".repeat(32),
    vote: "1",
    commitment: "cd".repeat(32),
    committed: false,
    dryRun: true,
    updatedAt: 1,
  };
  let rolls = 0;
  const { deps, rec } = makeDeps({
    dryRun: true,
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Commit)),
    votes: memVoteStore(vote),
    verdict: async () => {
      rolls += 1;
      return { optionIndex: 1, rationale: "r", confidence: 1 };
    },
  });
  (deps as RuntimeDeps & { assembleContext?: unknown }).assembleContext = undefined;
  await runDuty(deps, dutySignal());
  expect(rolls).toBe(0); // prior dry-run verdict short-circuits the LLM
  expect(rec.logs.some((l) => l.includes("dry-run"))).toBe(true);
});

test("crash between commit send and duty save → open duty with committed vote record heals", async () => {
  const vote: VoteRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    salt: "ab".repeat(32),
    vote: "1",
    commitment: "cd".repeat(32),
    committed: true,
    dryRun: false,
    updatedAt: 1,
  };
  const { deps, rec } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Commit)),
    votes: memVoteStore(vote),
  });
  await runDuty(deps, dutySignal());
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("committed");
  expect(rec.sends).toHaveLength(0); // no duplicate commit
});

test("committed duty in reveal phase → reveal sent → record revealed", async () => {
  const duty: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "committed",
    updatedAt: 1,
    seat: 0,
    drawAttempt: 0,
    reviewEnd: 1_000,
    commitEnd: 2_000,
    revealEnd: 3_000,
  };
  const vote: VoteRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    salt: "ab".repeat(32),
    vote: "1",
    commitment: "cd".repeat(32),
    committed: true,
    dryRun: false,
    updatedAt: 1,
  };
  const { deps, rec } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Reveal)),
    store: memDutyStore(duty),
    votes: memVoteStore(vote),
    now: async () => 2_500, // reveal window
  });
  await runDuty(deps, dutySignal(DisputeState.Reveal));
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("revealed");
  expect(rec.sends).toHaveLength(1); // the reveal tx
});

test("committed duty past revealEnd → abstain window-closed", async () => {
  const duty: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "committed",
    updatedAt: 1,
    seat: 0,
    drawAttempt: 0,
    reviewEnd: 1_000,
    commitEnd: 2_000,
    revealEnd: 3_000,
  };
  const { deps } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Reveal)),
    store: memDutyStore(duty),
    now: async () => 4_000,
  });
  await runDuty(deps, dutySignal(DisputeState.Reveal));
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("abstained");
  expect(record?.failure?.kind).toBe("window-closed");
});

test("open duty past commitEnd (phase reveal) → abstain window-closed, no LLM roll", async () => {
  let rolls = 0;
  const { deps } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Reveal)),
    now: async () => 2_500,
    verdict: async () => {
      rolls += 1;
      return { optionIndex: 0, rationale: "r", confidence: 1 };
    },
  });
  await runDuty(deps, dutySignal(DisputeState.Reveal));
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.failure?.kind).toBe("window-closed");
  expect(rolls).toBe(0);
});

test("salt lost at reveal → abstain salt-lost", async () => {
  const duty: DutyRecord = {
    dispute: DISPUTE,
    roundIdx: 0,
    status: "committed",
    updatedAt: 1,
    seat: 0,
    drawAttempt: 0,
    reviewEnd: 1_000,
    commitEnd: 2_000,
    revealEnd: 3_000,
  };
  const { deps } = makeDeps({
    chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Reveal)),
    store: memDutyStore(duty),
    votes: memVoteStore(), // no record → SaltLost inside revealVote
    now: async () => 2_500,
  });
  await runDuty(deps, dutySignal(DisputeState.Reveal));
  const record = await deps.store.load(DISPUTE as string, 0);
  expect(record?.status).toBe("abstained");
  expect(record?.failure?.kind).toBe("salt-lost");
});

test("abstained/revealed duties are skipped entirely", async () => {
  for (const status of ["abstained", "revealed"] as const) {
    const duty: DutyRecord = { dispute: DISPUTE, roundIdx: 0, status, updatedAt: 1 };
    const { deps, rec } = makeDeps({
      chain: dutyChain(roundFixture(), disputeFixture(DisputeState.Commit)),
      store: memDutyStore(duty),
    });
    await runDuty(deps, dutySignal());
    expect(rec.sends).toHaveLength(0);
    expect(rec.logs.some((l) => l.includes("skip") && l.includes(status))).toBe(true);
  }
});
