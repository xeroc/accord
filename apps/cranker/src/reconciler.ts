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
  DisputeState,
  fetchMaybeRound,
  findAllDisputes,
  findRoundPda,
  type Dispute,
  type Round,
} from "@useaccord/sdk";

import type { CrankContext, CrankDispatch } from "./dispatch.js";
import { sendIx } from "./send.js";
import { resolveNextAction } from "./state.js";
import type { CrankerWallet } from "./wallet.js";

/** Terminal states — never scanned (nothing left to crank). */
const TERMINAL = new Set<DisputeState>([DisputeState.Closed, DisputeState.Failed]);

export interface ReconcilerConfig {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  wallet: CrankerWallet;
  dispatch: CrankDispatch;
  /** Poll interval. Default 60_000ms. */
  intervalMs?: number;
  /** Wall clock returning Unix seconds. Default `Date.now()/1000`. */
  now?: () => bigint;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
  /** Override the dispute scan (tests). Defaults to `findAllDisputes(rpc)`. */
  fetchDisputes?: () => Promise<Account<Dispute>[]>;
  /** Override the round fetch (tests). Defaults to the SDK round PDA read. */
  fetchRound?: (dispute: Address, roundIdx: number) => Promise<Account<Round> | null>;
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
    log = defaultLog,
    now = defaultNow,
    fetchDisputes = () => findAllDisputes(config.rpc),
    fetchRound = (dispute, roundIdx) => fetchRoundAccount(config.rpc, dispute, roundIdx),
  } = config;

  const t = now();
  const send = (instruction: Instruction): Promise<string> =>
    sendIx(instruction, {
      rpc: config.rpc,
      rpcSubscriptions: config.rpcSubscriptions,
      feePayer: wallet.signer,
      log,
    });

  let fired = 0;
  const disputes = await fetchDisputes();
  for (const dispute of disputes) {
    if (TERMINAL.has(dispute.data.state)) continue;

    // 1) Resolve against the current round.
    const currentRound = await fetchRound(dispute.address, dispute.data.currentRound);
    let action = resolveNextAction(dispute.data, currentRound?.data ?? null, t);
    let round = currentRound;

    // 2) No current-round action and Final? Scan prior rounds for settlement.
    if (action === null && dispute.data.state === DisputeState.Final) {
      for (let i = 0; i < dispute.data.currentRound; i++) {
        const prior = await fetchRound(dispute.address, i);
        const a = resolveNextAction(dispute.data, prior?.data ?? null, t);
        if (a !== null) {
          action = a;
          round = prior;
          break;
        }
      }
    }
    if (action === null) continue;

    const ctx: CrankContext = {
      dispute,
      round,
      wallet,
      rpc: config.rpc,
      rpcSubscriptions: config.rpcSubscriptions,
      send,
    };
    const handled = await dispatch.execute(ctx, action);
    log("crank action", {
      dispute: dispute.address,
      action: action.kind,
      handled,
    });
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
