/**
 * runtime.ts — the daemon runtime (bean accord-vruh): composes the v1
 * pipeline modules into the loop SPEC.md's duty-flow diagram describes.
 *
 *   scan (boot + interval, accounts = truth) ──▶ joins: gates → executor
 *                                            └─▶ duties: tracker → state machine
 *
 * Duty state machine (record.status × chain phase):
 *
 *   open      review   → wait for the commit window
 *             commit   → evidence → verdict → commitVote → committed
 *                       (ladder exhausted / malformed verdict → abstain NOW;
 *                        evidence unavailable → HOLD and retry next scan —
 *                        SPEC failure table: "duty holds until intake succeeds
 *                        or the commit window closes")
 *             reveal   → abstain window-closed (we never got a commit in)
 *             final    → abstain window-closed
 *   committed review/commit → wait for the reveal window
 *             reveal   → revealVote (salt persisted at commit) → revealed
 *             final    → abstain window-closed
 *
 * All infrastructure is injected ({@link RuntimeDeps}); main.ts wires the
 * real SDK-backed seams. WS log hints (chain/events.ts) may trigger an
 * off-cycle scan — the interval scan alone is already correct.
 */

import type { Address, Instruction } from "@solana/kit";
import { findRoundPda, type AccordVotingClient, type Dispute, type Round } from "@useaccord/sdk";

import type { Config } from "./config";
import type { DutySignal, JoinCandidate, ReconcileChain, ReconcileResult } from "./chain/reconcile";
import { reconcile } from "./chain/reconcile";
import { evaluateJoinGate, type JoinPolicy } from "./join/gates";
import type { JoinBudget, JoinOutcome } from "./join/executor";
import { findEntry, loadBook, totalStaked } from "./join/book";
import { trackRound, dutyPhase, roundWindows } from "./duty/tracker";
import { abstain } from "./duty/failures";
import type { DutyStore } from "./duty/types";
import type { DutyIntakeInput } from "./duty/evidence";
import { EvidenceUnavailableError, MalformedBundleError } from "./duty/evidence";
import { RetryLadderExhaustedError } from "./agent/provider";
import { MalformedVerdictError, type AgentContext, type Verdict } from "./agent/runner";
import type { NotifyChannel } from "./notify/channel";
import { commitVote, CommitWindowClosedError, type VoteStore } from "./vote/commit";
import { revealVote, RevealWindowClosedError, SaltLostError } from "./vote/reveal";

/** Unbounded range ceiling when the operator sets no max (u64 tops out below this). */
const UNBOUNDED = 2n ** 128n;

/** The reconcile chain plus the single-dispute fetch the duty path needs. */
export interface RuntimeChain extends ReconcileChain {
  fetchDispute(dispute: Address): Promise<Dispute | null>;
}

/** Everything the daemon loop runs on. Real seams in main.ts, fakes in tests. */
export interface RuntimeDeps {
  readonly juror: Address;
  readonly stateDir: string;
  /** Blocks commit/reveal sends (join txs are NOT vote-shaped — they send). */
  readonly dryRun: boolean;
  readonly policy: JoinPolicy;
  readonly budget: JoinBudget;
  readonly chain: RuntimeChain;
  /** Execute one accepted join candidate (joinSubaccord in main). */
  join(candidate: JoinCandidate): Promise<JoinOutcome>;
  readonly store: DutyStore;
  readonly votes: VoteStore;
  readonly channel: NotifyChannel;
  /** The agent seam — ladder runner in main, stub in tests. */
  verdict(ctx: AgentContext): Promise<Verdict>;
  /** Evidence intake; undefined = not configured (duties hold, boot warned). */
  assembleContext?(input: DutyIntakeInput): Promise<AgentContext>;
  /** Commit/reveal instruction client + sender. */
  readonly voting: {
    client: AccordVotingClient;
    programId: Address;
    send(ix: Instruction): Promise<string>;
  };
  /** Staking-token ATA balance reader for the scan-time reserve gate. */
  tokenBalance?(owner: Address, mint: Address): Promise<bigint>;
  /** Chain-clock now (unix seconds) — windows are chain-time, not wall-time. */
  now(): Promise<number>;
  log?(message: string): void;
}

/** Build the pure join-gate policy from env config. */
export function joinPolicyFromConfig(config: Config): JoinPolicy {
  const g = config.joinGates;
  return {
    stakingTokenAllowlist: new Set(g.stakingTokens as Address[]),
    feeTokenAllowlist: new Set(g.feeTokens as Address[]),
    minStakeRange: { min: g.minStakeMin, max: g.minStakeMax ?? UNBOUNDED },
    feePerJurorRange: { min: g.feePerJurorMin, max: g.feePerJurorMax ?? UNBOUNDED },
    alphaBpsCap: g.alphaBpsCap,
    commitWindowFloorSecs: BigInt(g.commitWindowFloorSec),
    globalStakeBudget: g.stakeBudget,
    perSubaccordCap: g.subaccordCap,
    reserveFloor: g.reserveFloor,
  };
}

/** Build the send-time join budget from env config. */
export function joinBudgetFromConfig(config: Config): JoinBudget {
  const g = config.joinGates;
  return {
    globalStakeBudget: g.stakeBudget,
    perSubaccordCap: g.subaccordCap,
    reserveFloor: g.reserveFloor,
    minSolLamports: config.minSolLamports,
  };
}

/** One scan result: evaluate every join candidate, then advance every duty. */
export async function handleScan(deps: RuntimeDeps, result: ReconcileResult): Promise<void> {
  const log = deps.log ?? console.log;
  log(
    `scan: ${result.joinCandidates.length} subaccord(s), ` +
      `${result.duties.length} actionable duty/duties`,
  );
  await handleJoins(deps, result.joinCandidates);
  for (const signal of result.duties) {
    try {
      await runDuty(deps, signal);
    } catch (e) {
      log(
        `duty ${signal.dispute}:${signal.roundIdx} failed: ${errMessage(e)} — retrying next scan`,
      );
    }
  }
}

async function handleJoins(deps: RuntimeDeps, candidates: readonly JoinCandidate[]): Promise<void> {
  const log = deps.log ?? console.log;
  const book = await loadBook(deps.stateDir);
  // Budgets are per staking token: each candidate is evaluated against what
  // is already staked in ITS mint, not a cross-mint sum.
  const stakedByToken = new Map<Address, bigint>();

  for (const candidate of candidates) {
    if (findEntry(book, candidate.subaccord)) continue; // already in portfolio

    const balance = deps.tokenBalance
      ? await deps.tokenBalance(deps.juror, candidate.data.stakingToken)
      : undefined;
    const decision = evaluateJoinGate(candidate.data, deps.policy, {
      stakedElsewhere:
        stakedByToken.get(candidate.data.stakingToken) ??
        totalStaked(book, candidate.data.stakingToken),
      stakingTokenBalance: balance,
    });
    if (!decision.ok) {
      log(`join: skip ${candidate.subaccord} — ${decision.reason} (${decision.detail})`);
      continue;
    }
    try {
      const outcome = await deps.join(candidate);
      if (outcome.status === "joined") {
        stakedByToken.set(
          candidate.data.stakingToken,
          (stakedByToken.get(candidate.data.stakingToken) ??
            totalStaked(book, candidate.data.stakingToken)) + outcome.amount,
        );
        log(
          `join: joined ${outcome.subaccord} — staked ${outcome.amount}, sig ${outcome.signature}`,
        );
      } else if (outcome.status === "already-joined") {
        log(`join: ${outcome.subaccord} already joined (${outcome.staked} staked)`);
      } else {
        log(`join: ${outcome.subaccord} rejected — ${outcome.reason} (${outcome.detail})`);
      }
    } catch (e) {
      log(`join: ${candidate.subaccord} executor failed: ${errMessage(e)} — retrying next scan`);
    }
  }
}

/**
 * Advance one duty signal through its state machine. Every throw outside the
 * documented abstain paths is caught by {@link handleScan} and retried next
 * scan — the reconcile scan re-derives everything from chain truth.
 */
export async function runDuty(deps: RuntimeDeps, signal: DutySignal): Promise<void> {
  const log = deps.log ?? console.log;
  const now = await deps.now();
  const round = await deps.chain.fetchRound(signal.dispute, signal.roundIdx);
  if (!round) return; // round not created yet — next scan picks it up

  const record = await trackRound(
    { store: deps.store, ourKey: deps.juror, now: () => now },
    {
      dispute: signal.dispute,
      roundIdx: signal.roundIdx,
      drawAttempt: round.drawAttempt,
      jurorCount: round.jurorCount,
      jurors: round.jurors,
      reviewEnd: round.reviewEnd,
      commitEnd: round.commitEnd,
      revealEnd: round.revealEnd,
    },
  );
  if (!record) return;

  if (record.status === "revealed" || record.status === "abstained") {
    log(`duty: skip ${signal.dispute}:${signal.roundIdx} (${record.status})`);
    return;
  }

  const windows = roundWindows(round);
  const allCommitted = round.commitCount === round.jurorCount;
  const phase = dutyPhase(windows, now, allCommitted);
  const voteDeps = {
    store: deps.store,
    notify: deps.channel.alert,
    now: () => now,
  };

  if (record.status === "open") {
    const priorVote = await deps.votes.load(signal.dispute, signal.roundIdx);
    if (priorVote?.committed) {
      // Crash between commit-send and duty-save: the vote IS on chain.
      await deps.store.save({ ...record, status: "committed", updatedAt: now });
      log(`duty: healed ${signal.dispute}:${signal.roundIdx} → committed (vote already landed)`);
      return;
    }
    if (priorVote && deps.dryRun) {
      log(
        `duty: ${signal.dispute}:${signal.roundIdx} verdict held ` +
          `(vote ${priorVote.vote}, dry-run — no tx)`,
      );
      return;
    }
    if (phase === "review") return; // agent waits for the commit window
    if (phase !== "commit") {
      await abstain(
        voteDeps,
        signal,
        "window-closed",
        `commit window closed before a verdict was committed (phase ${phase})`,
      );
      return;
    }
    await runVerdictPipeline(deps, signal, round, priorVote, now);
    return;
  }

  // status === "committed"
  if (phase === "reveal") {
    await tryReveal(deps, signal, round, now, allCommitted);
    return;
  }
  if (phase === "final") {
    await abstain(
      voteDeps,
      signal,
      "window-closed",
      "reveal window closed before the vote was revealed",
    );
  }
}

/** Evidence → verdict → commit. `held` is a prior dry-run verdict to re-commit. */
async function runVerdictPipeline(
  deps: RuntimeDeps,
  signal: DutySignal,
  round: Round,
  held: { vote: string } | undefined,
  now: number,
): Promise<void> {
  const log = deps.log ?? console.log;
  const dispute = await deps.chain.fetchDispute(signal.dispute);
  if (!dispute) return; // stale scan — next scan re-reads

  let vote: bigint;
  let verdict: Verdict | undefined;
  if (held) {
    // DRY_RUN flipped off: re-commit the SAME salt+vote (stable commitment).
    vote = BigInt(held.vote);
  } else {
    if (!deps.assembleContext) {
      log(`duty: evidence intake not configured — holding ${signal.dispute}:${signal.roundIdx}`);
      return;
    }
    let ctx: AgentContext;
    try {
      ctx = await deps.assembleContext({
        dispute: signal.dispute,
        subaccord: signal.subaccord,
        juror: deps.juror,
        numOptions: dispute.numOptions,
      });
    } catch (e) {
      if (e instanceof EvidenceUnavailableError || e instanceof MalformedBundleError) {
        log(`duty: evidence unavailable for ${signal.dispute} — holding, retry next scan`);
        return; // SPEC: hold until intake succeeds or the window closes
      }
      throw e;
    }
    try {
      verdict = await deps.verdict(ctx);
      vote = BigInt(verdict.optionIndex);
    } catch (e) {
      if (e instanceof RetryLadderExhaustedError) {
        await abstain(
          { store: deps.store, notify: deps.channel.alert, now: () => now },
          signal,
          "retry-ladder-exhausted",
          e.message,
        );
        return;
      }
      if (e instanceof MalformedVerdictError) {
        await abstain(
          { store: deps.store, notify: deps.channel.alert, now: () => now },
          signal,
          "malformed-verdict",
          e.message,
        );
        return;
      }
      throw e; // transport-shaped: retry next scan
    }
  }

  const [roundPda] = await findRoundPda({
    dispute: signal.dispute,
    roundIdx: signal.roundIdx,
  });
  const accounts = {
    signer: deps.juror,
    subaccord: signal.subaccord,
    dispute: signal.dispute,
    round: roundPda,
  };
  let result;
  try {
    result = await commitVote(
      {
        client: deps.voting.client,
        programId: deps.voting.programId,
        store: deps.votes,
        send: deps.voting.send,
        notify: deps.channel.alert,
        now: () => now,
        log,
      },
      {
        accounts,
        roundIdx: signal.roundIdx,
        vote,
        numOptions: dispute.numOptions,
        reviewEnd: Number(round.reviewEnd),
        commitEnd: Number(round.commitEnd),
      },
      deps.dryRun,
    );
  } catch (e) {
    if (e instanceof CommitWindowClosedError) {
      log(`duty: commit window race on ${signal.dispute} — retrying next scan`);
      return; // the phase check abstains once the window is truly gone
    }
    throw e;
  }

  if (result.sent) {
    const record = await deps.store.load(signal.dispute, signal.roundIdx);
    await deps.store.save({ ...record!, status: "committed", updatedAt: now });
    log(`duty: committed ${signal.dispute}:${signal.roundIdx} vote ${vote}`);
  } else {
    log(`duty: dry-run commit held for ${signal.dispute}:${signal.roundIdx} vote ${vote}`);
  }
  // Verdict notice fires for every settled verdict, DRY_RUN-independent.
  await deps.channel.verdict({
    dispute: signal.dispute,
    option: Number(vote),
    rationale: verdict?.rationale ?? "re-commit of previously held verdict",
    confidence: verdict?.confidence ?? 1,
    dryRun: result.dryRun,
  });
}

async function tryReveal(
  deps: RuntimeDeps,
  signal: DutySignal,
  round: Round,
  now: number,
  allCommitted: boolean,
): Promise<void> {
  const log = deps.log ?? console.log;
  const [roundPda] = await findRoundPda({
    dispute: signal.dispute,
    roundIdx: signal.roundIdx,
  });
  try {
    const result = await revealVote(
      {
        client: deps.voting.client,
        programId: deps.voting.programId,
        store: deps.votes,
        send: deps.voting.send,
        notify: deps.channel.alert,
        now: () => now,
        log,
      },
      {
        accounts: {
          signer: deps.juror,
          subaccord: signal.subaccord,
          dispute: signal.dispute,
          round: roundPda,
        },
        roundIdx: signal.roundIdx,
        commitEnd: Number(round.commitEnd),
        revealEnd: Number(round.revealEnd),
        allCommitted,
      },
      deps.dryRun,
    );
    if (result.sent) {
      const record = await deps.store.load(signal.dispute, signal.roundIdx);
      await deps.store.save({ ...record!, status: "revealed", updatedAt: now });
      log(`duty: revealed ${signal.dispute}:${signal.roundIdx}`);
    } else if (!result.alreadyRevealed) {
      log(`duty: dry-run reveal held for ${signal.dispute}:${signal.roundIdx}`);
    }
  } catch (e) {
    if (e instanceof SaltLostError) {
      await abstain(
        { store: deps.store, notify: deps.channel.alert, now: () => now },
        signal,
        "salt-lost",
        e.message,
      );
      return;
    }
    if (e instanceof RevealWindowClosedError) {
      log(`duty: reveal window race on ${signal.dispute} — retrying next scan`);
      return; // the phase check abstains once the window is truly gone
    }
    throw e;
  }
}

export interface DaemonOptions {
  /** Scan interval (config.scanIntervalMs). */
  readonly intervalMs: number;
  /** Abort the loop (the boot scan still runs to completion). */
  readonly signal?: AbortSignal;
}

/** Running daemon handle: stop tears down; kick requests an off-cycle scan. */
export interface DaemonHandle {
  stop(): Promise<void>;
  /** WS-hint entry point — never stacks with an in-flight scan. */
  kick(): void;
}

/**
 * Boot scan (awaited), then scan every `intervalMs`. Resolves after the boot
 * scan with a handle: `kick()` runs an off-cycle scan (hint layer),
 * `stop()` tears the timer down and resolves once the loop is down.
 */
export async function runDaemon(deps: RuntimeDeps, opts: DaemonOptions): Promise<DaemonHandle> {
  let running = false;
  let pending = false;
  const guarded = async (): Promise<void> => {
    if (running) {
      pending = true; // one queued kick, not a stack
      return;
    }
    running = true;
    try {
      try {
        const result = await reconcile(deps.chain, deps.juror);
        await handleScan(deps, result);
      } catch (e) {
        (deps.log ?? console.log)(`scan failed: ${errMessage(e)} — retrying next interval`);
      }
    } finally {
      running = false;
      if (pending && !opts.signal?.aborted) {
        pending = false;
        void guarded();
      }
    }
  };

  await guarded(); // boot scan — restart-safe: pure function of chain state

  const timer = setInterval(() => void guarded(), opts.intervalMs);
  const { promise, resolve } = Promise.withResolvers<void>();
  const onAbort = () => {
    clearInterval(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    resolve();
  };
  if (opts.signal?.aborted) onAbort();
  else opts.signal?.addEventListener("abort", onAbort, { once: true });

  return {
    kick: () => void guarded(),
    stop: async () => {
      onAbort();
      await promise;
    },
  };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
