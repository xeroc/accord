/**
 * reconcile.ts — authoritative reconcile scans (bean accord-qg1w, feature
 * accord-24o6).
 *
 * The WS log subscriber is a *hint* layer; this scan is the truth. On boot
 * and on an interval it re-derives Jurat's worldview from account state:
 *
 *   - every Subaccord on the program → {@link JoinCandidate} (the join gates
 *     + executor decide what happens next; already-joined pools are filtered
 *     by the executor's idempotency),
 *   - every actionable dispute (Drawn / Commit / Reveal — the review phase
 *     lives in Drawn; Review is a dead on-chain arm) whose *current*
 *     Round panel contains our key → {@link DutySignal}.
 *
 * Because the scan is a pure function of chain state, missed events are
 * caught up by construction: whatever happened while Jurat was down (or while
 * a WS drop hid it) is re-derived on the next scan. No cursor, no replay.
 *
 * All chain access rides the {@link ReconcileChain} seam (mocked in the unit
 * suite); the real client (bean accord-lii9) implements it over the SDK's
 * `findAllSubaccords` / `findAllDisputes` / `findRoundPda` + `fetchRound`.
 */

import type { Address } from "@solana/kit";
import { DisputeState, type Dispute, type Round, type Subaccord } from "@useaccord/sdk";

/** A Subaccord observed on-chain, offered to the join gates + executor. */
export interface JoinCandidate {
  readonly subaccord: Address;
  readonly data: Subaccord;
}

/**
 * Our juror key is seated on `dispute`'s current round and the dispute is in
 * a phase where a juror acts (review evidence → commit → reveal).
 */
export interface DutySignal {
  readonly dispute: Address;
  readonly subaccord: Address;
  readonly roundIdx: number;
  /** Our position in `Round.jurors` (seat slot). */
  readonly jurorIndex: number;
  /** The actionable `DisputeState` observed at scan time. */
  readonly state: DisputeState;
}

/** Decoded account pairs the scan consumes (subset of Kit's `Account<T>`). */
export interface AccountView<T> {
  readonly address: Address;
  readonly data: T;
}

/** Impure chain surface for the scan. */
export interface ReconcileChain {
  /** All Subaccord accounts (`findAllSubaccords`). */
  fetchSubaccords(): Promise<readonly AccountView<Subaccord>[]>;
  /** All Dispute accounts (`findAllDisputes`). */
  fetchDisputes(): Promise<readonly AccountView<Dispute>[]>;
  /** The Round at `(dispute, roundIdx)`, or null when absent. */
  fetchRound(dispute: Address, roundIdx: number): Promise<Round | null>;
  /**
   * The juror's own JurorStake in `subaccord` (PDA read), null when no
   * account exists. Powers already-joined recognition at the scan layer.
   */
  fetchJurorStake(subaccord: Address, juror: Address): Promise<{ staked: bigint } | null>;
}

/**
 * A Subaccord the juror already holds a live stake in (on-chain truth, not
 * book state) — never re-offered to the join gates; heals the local book so
 * budget accounting counts real exposure.
 */
export interface HeldStake {
  readonly subaccord: Address;
  readonly stakingToken: Address;
  readonly staked: bigint;
}

export interface ReconcileResult {
  readonly joinCandidates: readonly JoinCandidate[];
  readonly duties: readonly DutySignal[];
  /** Pools the juror is already staked into (staked > 0). */
  readonly heldStakes: readonly HeldStake[];
}

/**
 * Dispute states in which a seated juror still has work to do. `Drawn` is the
 * review phase: `draw_seat` sets it when the panel fills and the windows open,
 * and it only leaves via the FIRST panel commit (commit.rs flips Drawn→Commit)
 * — nothing ever writes `Review` on chain (dead enum arm; kept here for
 * safety). Excluding Drawn made solo panels invisible: with no other juror to
 * commit first, the duty never surfaced and the dispute stalled into redraw
 * (bean accord-zhnh). `Created` stays excluded — partial panel, windows unset.
 */
const ACTIONABLE_STATES: ReadonlySet<DisputeState> = new Set([
  DisputeState.Drawn,
  DisputeState.Review,
  DisputeState.Commit,
  DisputeState.Reveal,
]);

/**
 * One scan. Pure function of (chain state, juror) — the same accounts always
 * yield the same result, which is what makes restarts and missed WS events
 * safe. ponytail: rounds are fetched sequentially; batch with
 * getMultipleAccounts if dispute volume ever makes the scan latency matter.
 */
export async function reconcile(chain: ReconcileChain, juror: Address): Promise<ReconcileResult> {
  const [subaccords, disputes] = await Promise.all([
    chain.fetchSubaccords(),
    chain.fetchDisputes(),
  ]);

  const duties: DutySignal[] = [];
  for (const d of disputes) {
    if (!ACTIONABLE_STATES.has(d.data.state)) continue;
    const round = await chain.fetchRound(d.address, d.data.currentRound);
    if (!round) continue; // round not yet created — next scan picks it up
    const jurorIndex = round.jurors.indexOf(juror);
    if (jurorIndex < 0) continue;
    duties.push({
      dispute: d.address,
      subaccord: d.data.subaccord,
      roundIdx: d.data.currentRound,
      jurorIndex,
      state: d.data.state,
    });
  }

  const joinCandidates: JoinCandidate[] = [];
  const heldStakes: HeldStake[] = [];
  for (const s of subaccords) {
    const own = await chain.fetchJurorStake(s.address, juror);
    if (own && own.staked > 0n) {
      heldStakes.push({
        subaccord: s.address,
        stakingToken: s.data.stakingToken,
        staked: own.staked,
      });
      continue; // already a juror here — never re-offer the pool to the join gates
    }
    joinCandidates.push({ subaccord: s.address, data: s.data });
  }

  return { joinCandidates, duties, heldStakes };
}

export interface ReconcileLoopOptions {
  /** Scan interval in milliseconds. */
  readonly intervalMs: number;
  /** Abort the loop (the boot scan still runs to completion). */
  readonly signal?: AbortSignal;
  readonly onResult: (result: ReconcileResult) => void;
  /** Scan failure surface — the loop keeps ticking and retries. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Run the boot scan immediately, then repeat every `intervalMs`. Resolves
 * once the boot scan finished and returns a `stop()` that clears the timer
 * and resolves after the loop is down.
 */
export async function startReconcileLoop(
  chain: ReconcileChain,
  juror: Address,
  opts: ReconcileLoopOptions,
): Promise<() => Promise<void>> {
  const scan = async (): Promise<void> => {
    try {
      opts.onResult(await reconcile(chain, juror));
    } catch (e) {
      opts.onError?.(e);
    }
  };
  await scan();

  const timer = setInterval(() => void scan(), opts.intervalMs);
  const { promise, resolve } = Promise.withResolvers<void>();
  const onAbort = () => {
    clearInterval(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    resolve();
  };
  if (opts.signal?.aborted) onAbort();
  else opts.signal?.addEventListener("abort", onAbort, { once: true });

  return async () => {
    onAbort();
    await promise;
  };
}
