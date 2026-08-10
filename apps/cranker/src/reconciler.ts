/**
 * Reconciler — the authoritative poll loop (milestone accord-27r5 §1/§4).
 *
 * Every {@link intervalMs} (default 60s): fetch every Dispute, drop the truly
 * terminal ones (Closed/Failed), and for each resolve the next crank action
 * against its current Round (and, when Final, its prior Rounds for settlement).
 * Any resolved action is dispatched via {@link CrankDispatch}; one action per
 * dispute per cycle (no bundling — the next cycle picks up the next action).
 *
 * The dispute + round fetchers are injectable so the loop is unit-testable with
 * no validator; they default to the SDK (`findAllDisputes` + `fetchMaybeRound`).
 */
import { isSome } from "@solana/kit";
import type {
  Account,
  Address,
  Instruction,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import {
  Accord,
  DisputeState,
  canExecuteAt,
  fetchMaybeAppealBond,
  fetchMaybePauseState,
  fetchMaybeRound,
  findAllDisputes,
  findAllPendingUpdates,
  findAppealBondPda,
  findPauseStatePda,
  findRoundPda,
  type AppealBond,
  type Dispute,
  type PauseState,
  type PendingUpdate,
  type Round,
} from "@useaccord/sdk";

import type { CrankAction, CrankContext, CrankKind } from "./dispatch.js";
import type { CrankAction as ResolveAction } from "./state.js";
import { sendIx } from "./send.js";
import { resolveNextAction } from "./state.js";
import type { CrankerWallet } from "./wallet.js";


export interface ReconcilerConfig {
  /** SDK facade — owns the RPC, signer, and adapter the cranks build with. */
  accord: Accord;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  wallet: CrankerWallet;
  dispatch: import("./dispatch.js").CrankDispatch;
  /** VRF oracle accounts (request_vrf CPI extras). */
  oracleQueue: Address;
  programIdentity: Address;
  /** Poll interval. Default 60_000ms. */
  intervalMs?: number;
  /** Wall clock returning Unix seconds. Default `Date.now()/1000`. */
  now?: () => bigint;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
  /** Override the dispute scan (tests). Defaults to `findAllDisputes(rpc)`. */
  fetchDisputes?: () => Promise<Account<Dispute>[]>;
  /** Override the round fetch (tests). Defaults to the SDK round PDA read. */
  fetchRound?: (dispute: Address, roundIdx: number) => Promise<Account<Round> | null>;
  /** Override the pending-update scan (tests). Defaults to `findAllPendingUpdates(rpc)`. */
  fetchPendingUpdates?: () => Promise<Account<PendingUpdate>[]>;
  /** Slot clock for timelock cranks (execute_update, execute_unpause). Defaults to `rpc.getSlot()`. */
  slot?: () => Promise<bigint>;
  /** Override the pause-state check (tests). Defaults to the SDK PauseState PDA read. */
  fetchPauseState?: () => Promise<Account<PauseState> | null>;
}

export interface ReconcilerHandle {
  /** Stop the poll timer. Idempotent. */
  stop(): void;
}

/**
 * Run one reconciliation cycle. Returns the number of actions a registered
 * handler actually executed (unhandled actions are logged + skipped — a crank
 * for that kind lands in a later epic).
 */
export async function reconcileOnce(config: ReconcilerConfig): Promise<number> {
  const {
    dispatch,
    wallet,
    accord,
    oracleQueue,
    programIdentity,
    log = defaultLog,
    now = defaultNow,
    fetchDisputes = () => findAllDisputes(accord.rpc),
    fetchRound = (dispute, roundIdx) => fetchRoundAccount(accord.rpc, dispute, roundIdx),
    fetchPendingUpdates = () => findAllPendingUpdates(accord.rpc),
    slot = async () => BigInt((await accord.rpc.getSlot().send()).valueOf()),
    fetchPauseState = async () => fetchPauseStateAccount(accord.rpc),
  } = config;

  const rpc = accord.rpc;
  const programId = Accord.PROGRAM_ID;
  const t = now();
  const send = (instruction: Instruction): Promise<string> =>
    sendIx(instruction, {
      rpc,
      rpcSubscriptions: config.rpcSubscriptions,
      feePayer: wallet.signer,
      log,
    });
  /** Adapt the reconciler's `(msg, fields)` logger to the cranks' per-kind sink. */
  const ctxLog = (kind: CrankKind, dispute: Address | null, msg: string): void =>
    log(`crank ${kind}`, { dispute, msg });

  let fired = 0;
  const disputes = await fetchDisputes();
  for (const dispute of disputes) {
    if (dispute.data.state === DisputeState.Closed) continue;

    // 1) Resolve against the current round.
    const currentRound = await fetchRound(dispute.address, dispute.data.currentRound);
    const resolved = resolveNextAction(dispute.data, currentRound?.data ?? null, t);
    let action: CrankAction | null = null;
    let round = currentRound;

    if (resolved !== null) {
      action = stampDispute(resolved, dispute.address);
    } else if (dispute.data.state === DisputeState.Final) {
      // 2) No current-round action and Final? Scan prior rounds for settlement.
      for (let i = 0; i < dispute.data.currentRound; i++) {
        const prior = await fetchRound(dispute.address, i);
        const a = resolveNextAction(dispute.data, prior?.data ?? null, t);
        if (a !== null) {
          action = stampDispute(a, dispute.address);
          round = prior;
          break;
        }
      }
    }
    // 3) No lifecycle action and Final/Failed with appeals? Sweep appeal bonds
    //    for an outstanding refund (one round per cycle; idempotent on-chain).
    if (
      action === null &&
      dispute.data.currentRound > 0 &&
      (dispute.data.state === DisputeState.Final ||
        dispute.data.state === DisputeState.Failed)
    ) {
      for (let r = 1; r <= dispute.data.currentRound; r++) {
        const [bondAddr] = await findAppealBondPda({
          dispute: dispute.address,
          roundIdx: r,
        });
        const bond = await fetchMaybeAppealBond(rpc, bondAddr);
        if (bond.exists && (bond as Account<AppealBond>).data.amount > 0n) {
          action = { kind: "claim_refund", dispute: dispute.address, roundIdx: r };
          break;
        }
      }
    }
    if (action === null) continue;

    const ctx: CrankContext = {
      accord,
      programId,
      cranker: wallet.address,
      oracleQueue,
      programIdentity,
      sendIx: send,
      log: ctxLog,
      dispute,
      round,
      rpc,
      rpcSubscriptions: config.rpcSubscriptions,
    };
    const handled = await dispatch.execute(ctx, action);
    log("crank action", {
      dispute: dispute.address,
      action: action.kind,
      handled,
    });
    if (handled) fired++;
  }

  // --- Phase 2: PendingUpdate timelock crank (execute_subaccord_update) ---
  const baseCtx: CrankContext = {
    accord,
    programId,
    cranker: wallet.address,
    oracleQueue,
    programIdentity,
    sendIx: send,
    log: ctxLog,
    rpc,
    rpcSubscriptions: config.rpcSubscriptions,
  };
  const updates = await fetchPendingUpdates();
  const currentSlot = await slot();
  for (const pending of updates) {
    if (canExecuteAt(pending.data.executeAfterSlot, currentSlot)) {
      const action: CrankAction = { kind: "execute_update", subaccord: pending.data.subaccord };
      const handled = await dispatch.execute(baseCtx, action);
      if (handled) fired++;
    }
  }

  // --- Phase 3: PauseState unpause crank (execute_unpause) ---
  const pauseState = await fetchPauseState();
  const pendingUnpauseAfter = pauseState?.data.pendingUnpauseAfter;
  if (
    pendingUnpauseAfter &&
    isSome(pendingUnpauseAfter) &&
    canExecuteAt(pendingUnpauseAfter.value, currentSlot)
  ) {
    const action: CrankAction = { kind: "execute_unpause" };
    const handled = await dispatch.execute(baseCtx, action);
    if (handled) fired++;
  }

  return fired;
}

/**
 * Start the poll loop. Fires one cycle immediately (so the cranker does work on
 * boot), then every {@link ReconcilerConfig.intervalMs}. A failed cycle is
 * logged but never kills the timer — the next cycle retries.
 */
export function startReconciler(config: ReconcilerConfig): ReconcilerHandle {
  const intervalMs = config.intervalMs ?? 60_000;
  const loop = async (): Promise<void> => {
    try {
      await reconcileOnce(config);
    } catch (e: unknown) {
      (config.log ?? defaultLog)("reconcile cycle failed", { error: errorDigest(e) });
    }
  };
  void loop();
  const timer: ReturnType<typeof setInterval> = setInterval(loop, intervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

/** Default SDK round fetch: derive the PDA, read + decode, null if absent. */
async function fetchRoundAccount(
  rpc: Rpc<SolanaRpcApi>,
  dispute: Address,
  roundIdx: number,
): Promise<Account<Round> | null> {
  const [pda] = await findRoundPda({ dispute, roundIdx });
  const maybe = await fetchMaybeRound(rpc, pda);
  if (maybe.exists) return maybe;
  return null;
}

/** Default SDK PauseState fetch: derive the singleton PDA, read + decode, null if absent. */
async function fetchPauseStateAccount(
  rpc: Rpc<SolanaRpcApi>,
): Promise<Account<PauseState> | null> {
  const [pda] = await findPauseStatePda({});
  const maybe = await fetchMaybePauseState(rpc, pda);
  if (maybe.exists) return maybe as Account<PauseState>;
  return null;
}

/**
 * Stamp the dispute address onto a resolver-emitted action. The state resolver
 * (state.ts) is pure over `Dispute` data and doesn't know the account address;
 * the reconciler does, and the dispatch contract ({@link CrankAction}) carries
 * it so every crank reads `action.dispute` uniformly. Type-safe exhaustive
 * switch over the resolver's 7-kind output union.
 */
function stampDispute(action: ResolveAction, dispute: Address): CrankAction {
  switch (action.kind) {
    case "draw_seat":
      return { kind: "draw_seat", seat: action.seat, dispute };
    case "settle_round":
      return { kind: "settle_round", roundIdx: action.roundIdx, dispute };
    case "request_vrf":
    case "finalize_round":
    case "finalize_dispute":
    case "cancel_dispute":
    case "redraw":
      return { kind: action.kind, dispute };
  }
}

function defaultNow(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

function defaultLog(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ msg, ...fields }));
}

function errorDigest(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
