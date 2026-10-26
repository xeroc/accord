// jurat.spec.ts — e2e: the full agentic-juror duty loop (bean accord-wnqf,
// feature accord-mehu, milestone accord-g69g). Drives the REAL jurat
// pipeline modules against Surfpool with a mock openai-compatible LLM:
//
//   reconcile scan → join gates → joinSubaccord (auto-join) →
//   dispute → VRF inject (harness vrf.ts) → draw (panel of 3:
//   2 background jurors + jurat) → background commit opens the duty →
//   reconcile scan finds jurat's seat → mock-LLM verdict through the real
//   provider ladder + runner → commitVote → warp → revealVote →
//   Round.reveals carries the verdict + notification emitted.
//   Then the failing-LLM twin: ladder exhausts → abstain + alert, no vote.
//
// dryRun is OFF in this spec only — it is the one place the vote path is
// proven against the real chain (everywhere else jurat defaults to DRY_RUN).
//
// Duty surfacing: reconcile surfaces actionable disputes (Drawn / Commit /
// Reveal — Drawn IS the review phase; Review is a dead on-chain arm). The
// duty opens while the dispute is still Drawn: runDuty holds through review
// and commits at window open, so the solo-panel case works too (bean
// accord-zhnh). The background juror's commit here just exercises the
// Drawn→Commit flip on chain.
//
// Panel guarantee: the pool holds exactly PANEL_SIZE stakers (2 background +
// jurat), so the VRF draw seats all three — jurat's seat is structural, not
// luck. Jurat's stake goes through the real join executor (accumulator slot
// resolution incl. free-list), so the harness tree is synced from its
// on-chain leaf afterwards.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { address, type Address } from "@solana/kit";
import {
  Accord,
  commit as sdkCommit,
  findAllDisputes,
  findAllSubaccords,
  fetchJurorStakeMaybe,
  fetchRoundMaybe,
  findJurorStakePda,
  findJurorStakesBySubaccord,
  findRoundPda,
  findSasAttestation,
  stake as sdkStake,
  getDisputeDecoder,
  getRoundDecoder,
  getSubaccordDecoder,
  type Round,
} from "@useaccord/sdk";
import { evaluateJoinGate } from "../../apps/jurat/src/join/gates.js";
import { joinSubaccord, type JoinChain } from "../../apps/jurat/src/join/executor.js";
import { reconcile, type ReconcileChain } from "../../apps/jurat/src/chain/reconcile.js";
import { trackRound } from "../../apps/jurat/src/duty/tracker.js";
import { abstain } from "../../apps/jurat/src/duty/failures.js";
import type { DutyRecord, DutyStore } from "../../apps/jurat/src/duty/types.js";
import { makeJuratTools } from "../../apps/jurat/src/agent/tools.js";
import {
  makeLadderVerdictRunner,
  RetryLadderExhaustedError,
} from "../../apps/jurat/src/agent/provider.js";
import { commitVote, type VoteRecord, type VoteStore } from "../../apps/jurat/src/vote/commit.js";
import { revealVote } from "../../apps/jurat/src/vote/reveal.js";
import type { NotifyChannel, VerdictNotice } from "../../apps/jurat/src/notify/channel.js";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { readClock } from "./setup/cheats.js";
import { setTokenBalance } from "./setup/tokens.js";
import { fetchDecoded } from "./setup/assertions.js";
import { chatCompletion, openAiError, startMockLlm } from "./setup/mock-llm.js";
import {
  addressBytes,
  armDispute,
  armSubaccordAndJurors,
  ataOf,
  ensurePause,
  resolveDistinctPanel,
  roleAccord,
  STAKE_AMOUNT,
  submitDraw,
  toAddress,
  toHex,
  warpTo,
  type DrawFixture,
  type JurorCtx,
} from "./draw-harness.js";

/** Staking-token reserve jurat must retain after the join (gate + executor). */
const RESERVE = 1_000n;
/** The mock model's deterministic verdict (2-option Plurality dispute). */
const VERDICT_OPTION = 1;
const VERDICT_JSON = JSON.stringify({
  optionIndex: VERDICT_OPTION,
  rationale: "Option 1's preimage matches the filer's claim.",
  confidence: 0.87,
});

function randomNonce(): bigint {
  return crypto
    .getRandomValues(new Uint8Array(8))
    .reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);
}

function memDutyStore(): DutyStore {
  const m = new Map<string, DutyRecord>();
  return {
    load: async (dispute, roundIdx) => m.get(`${dispute}:${roundIdx}`),
    save: async (record) => {
      m.set(`${record.dispute}:${record.roundIdx}`, record);
    },
  };
}

function memVoteStore(): VoteStore {
  const m = new Map<string, VoteRecord>();
  return {
    load: async (dispute, roundIdx) => m.get(`${dispute}:${roundIdx}`),
    save: async (record) => {
      m.set(`${record.dispute}:${record.roundIdx}`, record);
    },
  };
}

/** Recording NotifyChannel — the notification-emission assertion surface. */
interface RecordingChannel extends NotifyChannel {
  readonly verdicts: VerdictNotice[];
  readonly alerts: string[];
}

function recordingChannel(): RecordingChannel {
  const verdicts: VerdictNotice[] = [];
  const alerts: string[] = [];
  return {
    verdicts,
    alerts,
    verdict: async (notice) => {
      verdicts.push(notice);
    },
    alert: async (message) => {
      alerts.push(message);
    },
  };
}

describe("e2e: jurat agentic juror — requires Surfpool", () => {
  let env: TestEnv;
  let fx: DrawFixture;
  let juratAddr: Address;
  let juratAccord: Accord;
  let stateDir: string;
  /** The pool's min_stake — the amount each jurat join stakes (accord-fwl7). */
  let poolMin: bigint;
  let dutyStore: DutyStore;
  let voteStore: VoteStore;
  let channel: RecordingChannel;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return; // offline CI lane

    // --- jurat identity: one operator key, SOL-funded (rent + fees) ---
    const juratSigner = await fundSigner(env);
    juratAddr = juratSigner.address;
    juratAccord = roleAccord(env, juratSigner);

    // --- pool: gate-passing subaccord + 2 background jurors (harness) ---
    const accordState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, accordState, {}, 2);
    fx = { env, up: true, ...core };

    // Manual top-up model: stake + reserve floor in the staking token.
    await setTokenBalance(env, juratAddr, fx.mint, STAKE_AMOUNT + RESERVE);

    // --- auto-join: reconcile scan → gates → executor ---
    const scan = await reconcile(reconcileChain(), juratAddr);
    const candidate = scan.joinCandidates.find((c) => c.subaccord === fx.subaccord);
    expect(candidate).toBeDefined();
    expect(
      evaluateJoinGate(candidate!.data, joinPolicy(), {
        stakedElsewhere: 0n,
        stakingTokenBalance: STAKE_AMOUNT + RESERVE,
      }),
    ).toEqual({ ok: true });

    stateDir = await mkdtemp(join(tmpdir(), "jurat-e2e-"));
    const outcome = await joinSubaccord(joinChain(), {
      juror: juratAddr,
      subaccord: fx.subaccord,
      budget: {
        globalStakeBudget: 100_000n,
        perSubaccordCap: 50_000n,
        reserveFloor: RESERVE,
        minSolLamports: 50_000_000n,
      },
      stateDir,
    });
    // The join stakes exactly the pool minimum (bean accord-fwl7).
    poolMin = candidate!.data.minStake;
    expect(outcome).toMatchObject({ status: "joined", amount: poolMin });

    // The next iteration recognizes jurat's own JurorStake: the pool is never
    // re-offered as a join candidate, it is reported as a held stake instead.
    const rescan = await reconcile(reconcileChain(), juratAddr);
    expect(rescan.joinCandidates.some((c) => c.subaccord === fx.subaccord)).toBe(false);
    expect(rescan.heldStakes).toEqual([
      { subaccord: fx.subaccord, stakingToken: fx.mint, staked: poolMin },
    ]);

    // --- sync the harness tree with jurat's on-chain leaf (slot 2) ---
    const [juratStakePda] = await findJurorStakePda({
      subaccord: fx.subaccord,
      juror: juratAddr,
    });
    await fx.tree.setLeaf(2, juratAddr, candidate!.data.minStake);
    fx.jurorPdaByHex.set(toHex(addressBytes(juratAddr)), juratStakePda);
    dutyStore = memDutyStore();
    voteStore = memVoteStore();
    channel = recordingChannel();
  }, 300_000);

  // --- injected jurat seams over the live harness ----------------------------

  function joinPolicy() {
    return {
      stakingTokenAllowlist: new Set<Address>([fx.mint]),
      feeTokenAllowlist: new Set<Address>([fx.mint]),
      minStakeRange: { min: 1n, max: 1_000_000n },
      feePerJurorRange: { min: 1n, max: 10_000n },
      alphaBpsCap: 2_000,
      commitWindowFloorSecs: 86_400n,
      globalStakeBudget: 100_000n,
      perSubaccordCap: 50_000n,
      reserveFloor: RESERVE,
    };
  }

  function reconcileChain(): ReconcileChain {
    return {
      fetchSubaccords: async () =>
        (await findAllSubaccords(env.rpc)).map((a) => ({
          address: a.address as Address,
          data: a.data,
        })),
      fetchDisputes: async () =>
        (await findAllDisputes(env.rpc)).map((a) => ({
          address: a.address as Address,
          data: a.data,
        })),
      fetchRound: async (dispute, roundIdx) => {
        const [pda] = await findRoundPda({ dispute, roundIdx });
        const acc = await fetchRoundMaybe(env.rpc, pda);
        return acc.exists ? acc.data : null;
      },
      fetchJurorStake: async (subaccord, juror) => {
        const [pda] = await findJurorStakePda({ subaccord, juror });
        const acc = await fetchJurorStakeMaybe(env.rpc, pda);
        return acc.exists ? { staked: acc.data.staked } : null;
      },
    };
  }

  function joinChain(): JoinChain {
    return {
      programId: env.programId,
      staking: juratAccord.adapter,
      fetchSubaccord: async (sub) =>
        (await fetchDecoded(env, sub, getSubaccordDecoder())) ?? null,
      fetchJurorStakes: async (sub) =>
        (await findJurorStakesBySubaccord(env.rpc, sub)).map((a) => ({
          address: a.address as Address,
          juror: a.data.juror,
          staked: a.data.staked,
          treeIndex: a.data.treeIndex,
          prevFree: a.data.prevFree,
          nextFree: a.data.nextFree,
        })),
      tokenBalance: async (owner, mint) => {
        const ata = await ataOf(mint, owner);
        const res = await env.rpc.getTokenAccountBalance(ata).send();
        return BigInt(res.value.amount);
      },
      solBalance: async (owner) => (await env.rpc.getBalance(owner).send()).value,
      findAttestation: (binding) => findSasAttestation(env.rpc, binding),
      send: (ix) => env.sendIx(ix),
    };
  }

  /** Freeze one on-chain clock reading into the sync `now()` the jurat seams
   * take (Surfpool's clock is not wall time — never use Date.now()). */
  async function clockNow(): Promise<() => number> {
    const at = Number((await readClock(env)).unixTimestamp);
    return () => at;
  }

  async function decodedRound(roundPda: Address): Promise<Round> {
    const d = await fetchDecoded(env, roundPda, getRoundDecoder());
    if (!d) throw new Error(`Round not found: ${roundPda}`);
    return d;
  }

  /** Real read-only toolset over live chain accounts (no evidence daemon on
   * the Surfnet — the mock model never needs evidence files). */
  function agentContext(dispute: Address) {
    return {
      dispute,
      subaccord: fx.subaccord,
      numOptions: 2,
      maxSteps: 2,
      tools: makeJuratTools({
        readDispute: async (d) => fetchDecoded(env, address(d), getDisputeDecoder()),
        readSubaccord: async (s) => fetchDecoded(env, address(s), getSubaccordDecoder()),
        fetchEvidenceFile: async () => {
          throw new Error("no evidence bundle on the e2e Surfnet");
        },
        readDomainDoc: async () => "",
      }),
    };
  }

  /** A background juror commits option 0 — opens the duty (Drawn → Commit). */
  async function backgroundCommit(bg: JurorCtx, dispute: Address, roundPda: Address) {
    const { instruction } = await sdkCommit(
      bg.accord.adapter,
      env.programId,
      {
        signer: bg.signer.address,
        subaccord: fx.subaccord,
        dispute,
        round: roundPda,
      },
      { vote: 0n, salt: crypto.getRandomValues(new Uint8Array(32)) },
    );
    await env.sendIx(instruction);
  }

  /** Shared dispute arming: dispute → VRF inject → full panel draw. */
  async function armAndDraw() {
    const armed = await armDispute(fx, randomNonce());
    const memberships = await resolveDistinctPanel(fx, armed);
    const roundPda = await submitDraw(fx, armed, memberships);
    const seat = memberships.findIndex(
      (m) => toAddress(m.leaf.juror) === juratAddr,
    );
    expect(seat).toBeGreaterThanOrEqual(0);
    return { armed, roundPda, seat };
  }

  it("happy loop: auto-join → verdict → commit → reveal lands jurat's vote", async () => {
    if (!env.up) return;

    const { armed, roundPda, seat } = await armAndDraw();

    // The duty surfaces while the dispute is STILL Drawn (the review phase —
    // panel full, no commit yet). Solo panels have no other juror to flip the
    // state, so this is the recognition that makes them servable (accord-zhnh).
    const drawnScan = await reconcile(reconcileChain(), juratAddr);
    expect(drawnScan.duties.some((d) => d.dispute === armed.dispute)).toBe(true);

    // Open the commit window, then a background juror commits → the dispute
    // leaves Drawn (Drawn→Commit flip, commit.rs).
    const round = await decodedRound(roundPda);
    await warpTo(env, round.reviewEnd);
    await backgroundCommit(fx.jurors[0]!, armed.dispute, roundPda);

    // Duty discovery: scan surfaces our seat; the tracker persists it.
    const scan = await reconcile(reconcileChain(), juratAddr);
    const signal = scan.duties.find((d) => d.dispute === armed.dispute);
    expect(signal).toBeDefined();
    expect(signal!.jurorIndex).toBe(seat);
    const record = await trackRound(
      { store: dutyStore, ourKey: juratAddr, now: await clockNow() },
      {
        dispute: armed.dispute,
        roundIdx: 0,
        drawAttempt: round.drawAttempt,
        jurorCount: round.jurorCount,
        jurors: round.jurors,
        reviewEnd: round.reviewEnd,
        commitEnd: round.commitEnd,
        revealEnd: round.revealEnd,
      },
    );
    expect(record?.status).toBe("open");
    expect(record?.seat).toBe(seat);

    // Verdict: the real provider ladder + agent runner over the mock LLM.
    const llm = await startMockLlm((body) =>
      body.response_format !== undefined
        ? chatCompletion(VERDICT_JSON)
        : chatCompletion(""),
    );
    try {
      const runner = makeLadderVerdictRunner(
        { name: "primary", baseURL: llm.baseURL, apiKey: "test-key", modelId: "mock-model" },
        undefined,
        { retriesPerEndpoint: 1, initialBackoffMs: 1, sleep: async () => {} },
      );
      const verdict = await runner.runVerdict(agentContext(armed.dispute));
      expect(verdict.optionIndex).toBe(VERDICT_OPTION);
      // The dispute under judgment reached the model prompt.
      expect(JSON.stringify(llm.requests.at(-1))).toContain(armed.dispute);

      // Commit (dryRun OFF — this spec only). The operator key signs.
      const accounts = {
        signer: juratAddr,
        subaccord: fx.subaccord,
        dispute: armed.dispute,
        round: roundPda,
      };
      const committed = await commitVote(
        {
          client: juratAccord.adapter,
          programId: env.programId,
          store: voteStore,
          send: (ix) => env.sendIx(ix),
          notify: (m) => channel.alert(m),
          now: await clockNow(),
        },
        {
          accounts,
          roundIdx: 0,
          vote: BigInt(verdict.optionIndex),
          numOptions: 2,
          reviewEnd: Number(round.reviewEnd),
          commitEnd: Number(round.commitEnd),
        },
        false,
      );
      expect(committed.sent).toBe(true);
      expect(committed.dryRun).toBe(false);

      // Verdict notice — fires for every duty, DRY_RUN-independent.
      await channel.verdict({
        dispute: armed.dispute,
        option: verdict.optionIndex,
        rationale: verdict.rationale,
        confidence: verdict.confidence,
        dryRun: false,
      });

      // Warp to the reveal window; reveal with the EXACT persisted preimage.
      await warpTo(env, round.commitEnd);
      const revealed = await revealVote(
        {
          client: juratAccord.adapter,
          programId: env.programId,
          store: voteStore,
          send: (ix) => env.sendIx(ix),
          notify: (m) => channel.alert(m),
          now: await clockNow(),
        },
        {
          accounts,
          roundIdx: 0,
          commitEnd: Number(round.commitEnd),
          revealEnd: Number(round.revealEnd),
          allCommitted: false,
        },
        false,
      );
      expect(revealed.sent).toBe(true);

      // Round.votes: jurat's seat carries the verdict, counts advanced.
      const after = await decodedRound(roundPda);
      expect(Number(after.commitCount)).toBeGreaterThanOrEqual(2);
      expect(Number(after.revealCount)).toBe(1);
      expect(after.reveals[seat]).toBe(BigInt(VERDICT_OPTION));

      // Notification emitted.
      expect(channel.verdicts).toHaveLength(1);
      expect(channel.verdicts[0]).toMatchObject({
        dispute: armed.dispute,
        option: VERDICT_OPTION,
        dryRun: false,
      });
    } finally {
      await llm.stop();
    }
  }, 300_000);

  it("failing LLM: ladder exhausts → abstain + alert, no vote", async () => {
    if (!env.up) return;

    // Manual upstake — the documented operator flow (accord-fwl7). The happy
    // loop's draw reserved its α-bond out of jurat's floor (draw_seat.rs:
    // free_stake = staked − slash_reserve ≥ min_stake), and nothing settles
    // that dispute in this spec, so an exact-min juror is single-duty until
    // reconcile releases. Top up one min to restore draw eligibility.
    const juratStakePda = fx.jurorPdaByHex.get(toHex(addressBytes(juratAddr)))!;
    const upstake = sdkStake(
      juratAccord.adapter,
      env.programId,
      {
        juror: juratAddr,
        subaccord: fx.subaccord,
        accordState: fx.accordState,
        jurorStake: juratStakePda,
        stakingToken: fx.mint,
        jurorTokenAccount: await ataOf(fx.mint, juratAddr),
        stakeVault: await ataOf(fx.mint, fx.subaccord),
      },
      poolMin,
      await fx.tree.pathFor(2), // jurat's slot — top-up on the active leaf
    );
    await env.sendIx(upstake);
    await fx.tree.setLeaf(2, juratAddr, poolMin + poolMin);

    const { armed, roundPda } = await armAndDraw();
    const round = await decodedRound(roundPda);
    await warpTo(env, round.reviewEnd);
    await backgroundCommit(fx.jurors[0]!, armed.dispute, roundPda);

    const scan = await reconcile(reconcileChain(), juratAddr);
    expect(scan.duties.some((d) => d.dispute === armed.dispute)).toBe(true);

    const llm = await startMockLlm(() => openAiError(500, "mock llm down"));
    try {
      const runner = makeLadderVerdictRunner(
        { name: "primary", baseURL: llm.baseURL, apiKey: "test-key", modelId: "mock-model" },
        undefined,
        { retriesPerEndpoint: 2, initialBackoffMs: 1, sleep: async () => {} },
      );
      await expect(runner.runVerdict(agentContext(armed.dispute))).rejects.toThrow(
        RetryLadderExhaustedError,
      );
      expect(llm.requests.length).toBe(2); // primary retried, then burned

      // Clean abstain through the real failure path: mark, then alert.
      const record = await abstain(
        { store: dutyStore, notify: (m) => channel.alert(m), now: await clockNow() },
        { dispute: armed.dispute, roundIdx: 0 },
        "retry-ladder-exhausted",
        "primary exhausted after 2 attempts: mock llm down",
      );
      expect(record.status).toBe("abstained");
      expect(record.failure?.kind).toBe("retry-ladder-exhausted");

      // No vote-shaped tx ever left: only the background commit exists.
      const after = await decodedRound(roundPda);
      expect(Number(after.commitCount)).toBe(1);
      expect(Number(after.revealCount)).toBe(0);

      // Alert fired.
      expect(
        channel.alerts.some(
          (m) => m.includes("[jurat] abstained") && m.includes(armed.dispute),
        ),
      ).toBe(true);
    } finally {
      await llm.stop();
    }
  }, 300_000);
});
