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
import type { AccordEventHandlers } from "./chain/events";
import type {
  DutySignal,
  HeldStake,
  JoinCandidate,
  ReconcileChain,
  ReconcileResult,
} from "./chain/reconcile";
import { reconcile } from "./chain/reconcile";
import { evaluateJoinGate, type JoinPolicy } from "./join/gates";
import type { JoinBudget, JoinOutcome } from "./join/executor";
import { findEntry, loadBook, saveBook, totalStaked, upsertEntry } from "./join/book";
import { trackRound, dutyPhase, roundWindows } from "./duty/tracker";
import { abstain } from "./duty/failures";
import type { DutyStore } from "./duty/types";
import type { DutyIntake, DutyIntakeInput } from "./duty/evidence";
import { EvidenceUnavailableError, MalformedBundleError } from "./duty/evidence";
import type { TraceSink } from "./trace/sink";
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
  assembleContext?(input: DutyIntakeInput): Promise<DutyIntake>;
  /**
   * ADR-0037 trace — binds the memoized per-duty sink (see
   * makeTraceSinkBinder); undefined = tracing off. Emit failures never
   * propagate: the sink owns the never-throw contract.
   */
  readonly trace?: (subaccord: string, dispute: string) => TraceSink;
  readonly voting: {
    client: AccordVotingClient;
    programId: Address;
    send(ix: Instruction): Promise<string>;
  };
  /** Staking-token ATA balance reader for the scan-time reserve gate. */
  tokenBalance?(owner: Address, mint: Address): Promise<bigint>;
  /** Chain-clock now (unix seconds) — windows are chain-time, not wall-time. */
  now(): Promise<number>;
  /**
   * Deadline wake: fires an off-cycle scan when a deadline (commit-window
   * open) arrives, so verdict work starts on the window instead of the next
   * scan tick. Optional — absent = scan-cadence only (tests, embeds).
   */
  scheduleWake?(key: string, wakeAtMs: number): void;
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
  await handleJoins(deps, result.joinCandidates, result.heldStakes);
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

async function handleJoins(
  deps: RuntimeDeps,
  candidates: readonly JoinCandidate[],
  heldStakes: readonly HeldStake[],
): Promise<void> {
  const log = deps.log ?? console.log;
  let book = await loadBook(deps.stateDir);
  // On-chain stakes the scan recognized but the book missed (wiped state dir,
  // manual stake, second instance): heal so budgets count real exposure.
  const heal = heldStakes.filter((h) => !findEntry(book, h.subaccord));
  if (heal.length > 0) {
    for (const h of heal) {
      book = upsertEntry(book, {
        ...h,
        signature: "reconciled",
        joinedAt: new Date().toISOString(),
      });
    }
    await saveBook(deps.stateDir, book);
    log(`join: healed book with ${heal.length} on-chain stake(s) (already joined)`);
  }
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

  const trace = deps.trace?.(signal.subaccord, signal.dispute);
  const record = await trackRound(
    { store: deps.store, ourKey: deps.juror, now: () => now, trace },
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
    trace,
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
    if (phase === "review") {
      // The on-chain commit gate (commit.rs) rejects any earlier tx — but the
      // START of the work must not wait for the next scan (120s in deployment):
      // schedule a wake at reviewEnd + 1s so evidence+LLM begin the moment the
      // commit window opens. No scheduleWake (tests, embeds) = old behavior.
      deps.scheduleWake?.(`${signal.dispute}:${signal.roundIdx}`, (windows.reviewEnd + 1) * 1000);
      return; // agent waits for the commit window
    }
    if (phase !== "commit") {
      await abstain(
        voteDeps,
        signal,
        "window-closed",
        `commit window closed before a verdict was committed (phase ${phase})`,
      );
      return;
    }
    await runVerdictPipeline(deps, signal, round, priorVote, now, trace);
    return;
  }

  // status === "committed"
  if (phase === "reveal") {
    await tryReveal(deps, signal, round, now, allCommitted, trace);
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
  trace: TraceSink | undefined,
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
    let intake: DutyIntake;
    try {
      intake = await deps.assembleContext({
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
    trace?.emit({ kind: "evidence", files: intake.files });
    // The runner's step tap (ADR-0037) rides AgentContext.trace.
    const ctx: AgentContext = trace
      ? { ...intake.context, trace: (event) => trace.emit(event) }
      : intake.context;
    try {
      verdict = await deps.verdict(ctx);
      vote = BigInt(verdict.optionIndex);
    } catch (e) {
      if (e instanceof RetryLadderExhaustedError) {
        await abstain(
          { store: deps.store, notify: deps.channel.alert, now: () => now, trace },
          signal,
          "retry-ladder-exhausted",
          e.message,
        );
        return;
      }
      if (e instanceof MalformedVerdictError) {
        await abstain(
          { store: deps.store, notify: deps.channel.alert, now: () => now, trace },
          signal,
          "malformed-verdict",
          e.message,
        );
        return;
      }
      throw e; // transport-shaped: retry next scan
    }
    // Sealed verdict frame — unsealAt = round.revealEnd (chain seconds → ms;
    // open mode strips it sink-side).
    trace?.emit({
      kind: "verdict",
      optionIndex: verdict.optionIndex,
      rationale: verdict.rationale,
      confidence: verdict.confidence,
      unsealAt: Number(round.revealEnd) * 1_000,
    });
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
  trace?.emit({ kind: "commit", tx: result.signature, dryRun: result.dryRun });
  // FLIP publication (inveigo ADR-0013 amendment): Final+1 = FLIP per inveigo
  // settle.rs — the pot pays out, so the trace goes public. Only on a REAL
  // commit (dry-run holds never publish; the held-recommit path counts — its
  // `vote` IS the committed side). Fire-and-report: a failed publish logs +
  // alerts but never disturbs the duty pipeline.
  if (result.sent && vote === 1n) {
    try {
      await trace?.publishTrace();
    } catch (e) {
      log(
        `trace: publish failed for ${signal.dispute}: ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
      await deps.channel.alert(
        `trace-public failed for ${signal.dispute} (FLIP commit ${result.signature})`,
      );
    }
  }
  await deps.channel.verdict({
    dispute: signal.dispute,
    option: Number(vote),
    rationale: verdict?.rationale ?? "re-commit of previously held verdict",
    confidence: verdict?.confidence ?? 1,
    dryRun: result.dryRun,
  });

  // Our commit completed the panel (commitCount is the pre-commit fetch, so
  // +1 is exactly us; concurrent commits only make the panel fuller): the
  // chain flipped the round to Reveal — reveal now instead of idling out the
  // commit window (reveal.rs early-open, ADR-0038 panel-full shrink).
  if (result.sent && round.commitCount + 1 === round.jurorCount) {
    await tryReveal(deps, signal, round, now, true, trace);
  }
}

async function tryReveal(
  deps: RuntimeDeps,
  signal: DutySignal,
  round: Round,
  now: number,
  allCommitted: boolean,
  trace: TraceSink | undefined,
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
    if (result.sent && result.signature !== undefined) {
      trace?.emit({ kind: "reveal", tx: result.signature });
      const record = await deps.store.load(signal.dispute, signal.roundIdx);
      await deps.store.save({ ...record!, status: "revealed", updatedAt: now });
      log(`duty: revealed ${signal.dispute}:${signal.roundIdx}`);
    } else if (!result.sent && !result.alreadyRevealed) {
      log(`duty: dry-run reveal held for ${signal.dispute}:${signal.roundIdx}`);
    }
  } catch (e) {
    if (e instanceof SaltLostError) {
      await abstain(
        { store: deps.store, notify: deps.channel.alert, now: () => now, trace },
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

export interface WakeSchedulerDeps {
  /** Fired when a deadline arrives (the daemon's off-cycle scan). */
  readonly wake: () => void;
  /** Timer seams — injectable for tests. */
  readonly setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * Deadline scheduler for duty windows: one timer per tracked deadline, keyed
 * `dispute:round`. A LATER deadline for an existing key never overrides an
 * earlier one (the earlier wake sees the duty through), an earlier one
 * replaces it. Wakes never stack — firing just requests an off-cycle scan,
 * and the scan re-schedules only if the duty is still short of its window.
 */
export function makeWakeScheduler(deps: WakeSchedulerDeps): {
  schedule(key: string, wakeAtMs: number): void;
  dispose(): void;
} {
  const setTimeoutFn = deps.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimeoutFn =
    deps.clearTimeoutFn ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout));
  const pending = new Map<string, { handle: unknown; atMs: number }>();
  return {
    schedule(key, wakeAtMs) {
      const existing = pending.get(key);
      if (existing && existing.atMs <= wakeAtMs) return; // earlier-or-equal already set
      if (existing) clearTimeoutFn(existing.handle);
      const handle = setTimeoutFn(
        () => {
          pending.delete(key);
          deps.wake();
        },
        Math.max(wakeAtMs - Date.now(), 0),
      );
      pending.set(key, { handle, atMs: wakeAtMs });
    },
    dispose() {
      for (const { handle } of pending.values()) clearTimeoutFn(handle);
      pending.clear();
    },
  };
}

// --- WS hint handlers (bean accord-thgk) ---------------------------------------

/** Seam inputs for {@link makeHintHandlers}: our key, the daemon kick, sinks. */
export interface HintHandlersDeps {
  /** The single operator key — the juror a seat must name to be ours. */
  readonly juror: Address;
  /** Request an off-cycle scan (`DaemonHandle.kick`). */
  readonly kick: () => void;
  /** Operator notification (`NotifyChannel.alert` — never rejects). */
  alert(message: string): void | Promise<void>;
  /** Operational log; defaults to `console.log`. */
  log?(message: string): void;
}

/**
 * The composition layer `events.ts` documents: only OUR `SeatDrawn` is a
 * duty — identify it right away (log + operator alert "duty received") and
 * kick an immediate scan. Foreign seats are ignored (a live network draws
 * constantly; every kick is a full reconcile). The other hints carry no
 * juror, so they log what identifies them and kick. Hints stay
 * non-authoritative either way: the scan re-verifies membership against
 * `Round.jurors[]` before acting.
 */
export function makeHintHandlers(deps: HintHandlersDeps): AccordEventHandlers {
  const log = deps.log ?? console.log;
  return {
    onSeatDrawn: (e) => {
      if (e.juror !== deps.juror) return;
      const msg =
        `duty received: SeatDrawn seat ${e.seat} on dispute ${e.dispute} ` +
        `(round ${e.roundIdx}) juror ${e.juror}`;
      log(msg);
      void deps.alert(msg);
      deps.kick();
    },
    onRedrawn: (e) => {
      log(`hints: Redrawn dispute ${e.dispute} (round ${e.roundIdx}) — kicking scan`);
      deps.kick();
    },
    onSubaccordCreated: (e) => {
      log(`hints: SubaccordCreated subaccord ${e.subaccord} — kicking scan`);
      deps.kick();
    },
    onDisputeCreated: (e) => {
      log(`hints: DisputeCreated dispute ${e.dispute} subaccord ${e.subaccord} — kicking scan`);
      deps.kick();
    },
    onError: (err) => log(`hints: dropped event (${errMessage(err)})`),
  };
}

/**
 * Boot scan (awaited), then scan every `intervalMs`. Resolves after the boot
 * scan with a handle: `kick()` runs an off-cycle scan (hint layer),
 * `stop()` tears the timer down and resolves once the loop is down.
 */
export async function runDaemon(deps: RuntimeDeps, opts: DaemonOptions): Promise<DaemonHandle> {
  let running = false;
  let pending = false;
  let inflight: Promise<void> | undefined;
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
        inflight = guarded(); // chained re-kick stays tracked
      }
    }
  };

  await guarded(); // boot scan — restart-safe: pure function of chain state

  const timer = setInterval(() => void (inflight = guarded()), opts.intervalMs);
  const { promise, resolve } = Promise.withResolvers<void>();
  const onAbort = () => {
    clearInterval(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    resolve();
  };
  if (opts.signal?.aborted) onAbort();
  else opts.signal?.addEventListener("abort", onAbort, { once: true });

  return {
    kick: () => void (inflight = guarded()),
    stop: async () => {
      onAbort();
      await inflight; // let an in-flight scan land — no dangling RPC after stop
      await promise;
    },
  };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
