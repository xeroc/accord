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
  fetchMaybeAccordState,
  fetchMaybeDispute,
  fetchMaybeRound,
  findAllDisputes,
  findAllPendingUpdates,
  findAllSubaccords,
  findAppealBondPda,
  findJurorStakesBySubaccord,
  findAccordStatePda,
  findRoundPda,
  type AppealBond,
  type Dispute,
  type AccordState,
  type PendingUpdate,
  type Round,
} from "@useaccord/sdk";
import {
  findAllCanonItems as defaultFetchCanonItems,
  findAllCanonLists as defaultFetchCanonLists,
  CANON_PROGRAM_ID,
  ItemState,
  type CanonItem,
  type CanonList,
} from "@useaccord/canon";
import { findAllSynodCases as defaultFetchSynodCases, type SynodCase } from "@useaccord/synod";

import { findRemovedCanonItemAddresses as defaultScanRemovedCanonItems } from "./canon-gc.js";
import { resolveCanonAction } from "./canon-state.js";
import { resolveSynodAction } from "./synod-state.js";
import type { CrankAction, CrankContext, CrankDispatch, CrankKind } from "./dispatch.js";
import type { CrankAction as ResolveAction } from "./state.js";
import { log } from "./log.js";
import { formatError, sendIx } from "./send.js";
import { resolveNextAction } from "./state.js";
import type { CrankerWallet } from "./wallet.js";

export interface ReconcilerConfig {
  /** SDK facade — owns the RPC, signer, and adapter the cranks build with. */
  accord: Accord;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  wallet: CrankerWallet;
  dispatch: CrankDispatch;
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
  /** Override a single-dispute fetch (scoped dispatch). Defaults to `fetchMaybeDispute(rpc, addr)`. */
  fetchDisputeOne?: (addr: Address) => Promise<Account<Dispute> | null>;
  /** Override the round fetch (tests). Defaults to the SDK round PDA read. */
  fetchRound?: (dispute: Address, roundIdx: number) => Promise<Account<Round> | null>;
  /** Override the appeal-bond fetch (tests). Bond seed `roundIdx` is the
   *  round BEING appealed (0-based). Defaults to the SDK AppealBond PDA read. */
  fetchAppealBond?: (dispute: Address, roundIdx: number) => Promise<Account<AppealBond> | null>;
  /** Override the Canon item scan (tests). Defaults to `findAllCanonItems(rpc)`. */
  fetchCanonItems?: () => Promise<Account<CanonItem>[]>;
  /** Override the Canon list scan (tests). Defaults to `findAllCanonLists(rpc)`. */
  fetchCanonLists?: () => Promise<Account<CanonList>[]>;
  /** Override the Removed-canon-item GC scan (tests). Defaults to the canon-gc
   * GPA query (discriminator + `state == Removed` memcmp, bean accord-m5fd). */
  fetchRemovedCanonItems?: () => Promise<Address[]>;
  /** Canon GC (close_item) module toggle. Default: enabled. */
  canonCloseEnabled?: boolean;
  /** Canon program id for canon cranks + the GC scan. Default: SDK `CANON_PROGRAM_ID`. */
  canonProgramId?: Address;
  /** Override the Synod case scan (tests). Defaults to `findAllSynodCases(rpc)`. */
  fetchSynodCases?: () => Promise<Account<SynodCase>[]>;

  /** Override the pending-update scan (tests). Defaults to `findAllPendingUpdates(rpc)`. */
  fetchPendingUpdates?: () => Promise<Account<PendingUpdate>[]>;
  /** Slot clock for timelock cranks (execute_update, execute_unpause). Defaults to `rpc.getSlot()`. */
  slot?: () => Promise<bigint>;
  /** Override the pause-state check (tests). Defaults to the SDK AccordState PDA read. */
  fetchAccordState?: () => Promise<Account<AccordState> | null>;
  /** Override the reclaimable-slot scan (tests). Defaults to scanning all subaccords. */
  fetchReclaimableSlots?: () => Promise<ReclaimableSlot[]>;
}

/** A drained JurorStake eligible for reclaim_slot (RECLAIM-LEAF discovery). */
export interface ReclaimableSlot {
  subaccord: Address;
  jurorStake: Address;
}

/** u32::MAX sentinel — nextFree === this means "not on the free list". */
const UINT32_MAX = 4294967295;

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
    fetchAppealBond = (dispute, roundIdx) => fetchAppealBondAccount(accord.rpc, dispute, roundIdx),
    fetchPendingUpdates = () => findAllPendingUpdates(accord.rpc),
    slot = async () => BigInt((await accord.rpc.getSlot().send()).valueOf()),
    fetchAccordState = async () => fetchAccordStateAccount(accord.rpc),
    fetchReclaimableSlots = async () => scanReclaimableSlots(accord.rpc),
    fetchCanonItems = () => defaultFetchCanonItems(accord.rpc),
    fetchCanonLists = () => defaultFetchCanonLists(accord.rpc),
    fetchSynodCases = () => defaultFetchSynodCases(accord.rpc),
    canonCloseEnabled = true,
    canonProgramId = CANON_PROGRAM_ID as Address,
    fetchRemovedCanonItems = () => defaultScanRemovedCanonItems(accord.rpc, canonProgramId),
  } = config;

  const rpc = accord.rpc;
  const programId = Accord.PROGRAM_ID;
  const t = now();
  /**
   * Context whose EVERY log line — crank lines and tx send/confirm/failure
   * lines — is tagged with the accounts the action belongs to: at minimum the
   * subaccord it deals with (Accord dispute cranks resolve it off the Dispute;
   * update/reclaim/synod carry it directly), plus the acting account itself.
   */
  const ctxFor = (tags: Record<string, unknown>): CrankContext => {
    const taggedLog = (msg: string, fields?: Record<string, unknown>): void =>
      log(msg, { ...fields, ...tags });
    return {
      accord,
      programId,
      cranker: wallet.address,
      oracleQueue,
      programIdentity,
      sendIx: (instruction: Instruction): Promise<string> =>
        sendIx(instruction, {
          rpc,
          rpcSubscriptions: config.rpcSubscriptions,
          feePayer: wallet.signer,
          log: taggedLog,
        }),
      signer: wallet.signer,
      log: (kind: CrankKind, subject: Address | null, detail: string): void =>
        taggedLog(`crank ${kind}`, { subject, detail }),
      rpc,
      rpcSubscriptions: config.rpcSubscriptions,
      canonProgramId,
    };
  };
  /**
   * Execute one action, isolated: a failure is logged with its tags and
   * skipped — one stuck account must not starve the rest of the cycle (the
   * next cycle retries it). This is the skip semantics send.ts documents for
   * simulation errors, extended to unexpected throws.
   */
  const runAction = async (
    ctx: CrankContext,
    action: CrankAction,
    tags: Record<string, unknown>,
  ): Promise<boolean> => {
    try {
      return await dispatch.execute(ctx, action);
    } catch (e: unknown) {
      log("crank action failed", { ...tags, action: action.kind, error: formatError(e) });
      return false;
    }
  };

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
    //    Bond PDA seeds are the round BEING appealed (0-based:
    //    0..currentRound-1) — the sweep used to probe 1..currentRound, so the
    //    FIRST appellant's bond (seed 0) was never swept (bean accord-br6a).
    if (
      action === null &&
      dispute.data.currentRound > 0 &&
      (dispute.data.state === DisputeState.Final || dispute.data.state === DisputeState.Failed)
    ) {
      for (let r = 0; r < dispute.data.currentRound; r++) {
        const bond = await fetchAppealBond(dispute.address, r);
        if (bond !== null && bond.data.amount > 0n) {
          action = { kind: "claim_refund", dispute: dispute.address, roundIdx: r };
          break;
        }
      }
    }
    if (action === null) continue;

    const tags = { dispute: dispute.address, subaccord: dispute.data.subaccord };
    const ctx: CrankContext = { ...ctxFor(tags), dispute, round };
    const handled = await runAction(ctx, action, tags);
    log("crank action", { ...tags, action: action.kind, handled });
    if (handled) fired++;
  }

  // --- Phase 2: PendingUpdate timelock crank (execute_subaccord_update) ---
  const updates = await fetchPendingUpdates();
  const currentSlot = await slot();
  for (const pending of updates) {
    if (canExecuteAt(pending.data.executeAfterSlot, currentSlot)) {
      const action: CrankAction = { kind: "execute_update", subaccord: pending.data.subaccord };
      const handled = await runAction(ctxFor({ subaccord: pending.data.subaccord }), action, {
        subaccord: pending.data.subaccord,
      });
      if (handled) fired++;
    }
  }

  // --- Phase 3: AccordState unpause crank (execute_unpause) ---
  const accordState = await fetchAccordState();
  const pendingUnpauseAfter = accordState?.data.pendingUnpauseAfter;
  if (
    pendingUnpauseAfter &&
    isSome(pendingUnpauseAfter) &&
    canExecuteAt(pendingUnpauseAfter.value, currentSlot)
  ) {
    const action: CrankAction = { kind: "execute_unpause" };
    const handled = await runAction(ctxFor({}), action, {});
    if (handled) fired++;
  }

  // --- Phase 4: reclaim_slot discovery (RECLAIM-LEAF) ---
  // Scan all Subaccords for fully-drained JurorStakes not yet on the free
  // list. One reclaim per cycle (the next cycle picks up the next slot).
  const reclaimable = await fetchReclaimableSlots();
  for (const slotInfo of reclaimable) {
    const action: CrankAction = {
      kind: "reclaim_slot",
      subaccord: slotInfo.subaccord,
      jurorStake: slotInfo.jurorStake,
    };
    const handled = await runAction(ctxFor({ subaccord: slotInfo.subaccord }), action, {
      subaccord: slotInfo.subaccord,
    });
    if (handled) fired++;
  }

  // Dispute lookup shared by the Canon + Synod phases: keyed by address, from
  // the Phase-1 Dispute scan (no extra fetch).
  const disputeByAddr = new Map(disputes.map((d) => [d.address.toString(), d]));

  // --- Phase 5: Canon item cranks (canon_advance_pending / canon_settle_item /
  //     canon_advance_withdrawal — the Arbitrable guest program) ---
  // Scan every CanonItem, resolve against its CanonList (windows live on the
  // list), and settle only once the item's Accord dispute is Final.
  const canonItems = await fetchCanonItems();
  if (canonItems.length > 0) {
    const canonLists = new Map((await fetchCanonLists()).map((l) => [l.address.toString(), l]));
    for (const item of canonItems) {
      const list = canonLists.get(item.data.list.toString());
      if (list === undefined) continue;
      const disputeFinal =
        item.data.state === ItemState.Disputed &&
        disputeByAddr.get(item.data.activeDispute.toString())?.data.state === DisputeState.Final;
      const resolved = resolveCanonAction(item.data, list.data, disputeFinal, t);
      if (resolved === null) continue;
      const action: CrankAction = { kind: resolved.kind, item: item.address };
      const handled = await runAction(ctxFor({ item: item.address }), action, {
        item: item.address,
      });
      log("crank action", { item: item.address, action: action.kind, handled });
      if (handled) fired++;
    }
  }

  // --- Phase 5b: Canon GC (canon_close_item — bean accord-m5fd) ---
  // Server-side-filtered GPA sweep for Removed items; catches everything the
  // canon WS listener missed, including items delisted before the cranker
  // booted. Profitability (rent vs tx fee + margin) is guarded inside the
  // executor, and the dispatch map dedupes against the in-flight listener
  // dispatch of the same item.
  if (canonCloseEnabled) {
    const removed = await fetchRemovedCanonItems();
    for (const item of removed) {
      const action: CrankAction = { kind: "canon_close_item", item };
      const handled = await runAction(ctxFor({ item }), action, { item });
      log("crank action", { item, action: action.kind, handled });
      if (handled) fired++;
    }
  }

  // --- Phase 6: Synod case cranks (synod_file_dispute / synod_refund_roster_miss /
  //     synod_claim — the N-party escrow Arbitrable, bean accord-i1mp) ---
  // Scan every SynodCase and resolve against its bound dispute (dispute state
  // from the Phase-1 scan). One action per case per cycle; the per-party
  // sweeps advance via the on-chain paid_out bits. Executors land with the
  // synod crank epic — until registered, dispatch logs + skips.
  const synodCases = await fetchSynodCases();
  for (const c of synodCases) {
    const bound = disputeByAddr.get(c.data.dispute.toString());
    const resolved = resolveSynodAction(c.data, bound?.data ?? null, t);
    if (resolved === null) continue;
    const action: CrankAction =
      resolved.kind === "synod_file_dispute"
        ? { kind: resolved.kind, case: c.address }
        : { kind: resolved.kind, case: c.address, partyIndex: resolved.partyIndex };
    const tags = { case: c.address, subaccord: c.data.subaccord };
    const handled = await runAction(ctxFor(tags), action, tags);
    log("crank action", { ...tags, action: action.kind, handled });
    if (handled) fired++;
  }

  return fired;
}

/**
 * Scoped dispatch for latency-critical transitions (WS account writes, the
 * `VrfCommitted` log trigger): re-resolve → execute → RE-RESOLVE with fresh
 * state until the dispute settles. Live failure mode (2026-10-30): a dispatch
 * resolved `request_vrf` off a pre-callback snapshot, the handler detected
 * `committed_vrf already set` and skipped — and the dispatch ended, leaving
 * `draw_seat` to the next poll cycle (+60s). Each iteration re-fetches the
 * dispute; a cycle that does nothing settles the loop, a failed action
 * settles it too (the poll is the backstop), and concurrent dispatches for
 * the same dispute coalesce into one run.
 */
const scopedInflight = new Map<string, Promise<number>>();

export async function reconcileDispute(
  config: ReconcilerConfig,
  addr: Address,
  opts: { iterations?: number; pauseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<number> {
  const maxIterations = opts.iterations ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pauseMs = opts.pauseMs ?? 300;
  const key = addr.toString();
  const inflight = scopedInflight.get(key);
  if (inflight !== undefined) return inflight;
  const run = (async (): Promise<number> => {
    let total = 0;
    for (let i = 0; i < maxIterations; i++) {
      if (i > 0) await sleep(pauseMs);
      const fetched = await (config.fetchDisputeOne?.(addr) ??
        fetchMaybeDispute(config.accord.rpc, addr));
      // fetchDisputeOne returns a full Account (no `exists` tag); the default
      // fetch returns a kit MaybeAccount — normalize to Account | null.
      const snapshot =
        fetched !== null && (!("exists" in fetched) || fetched.exists)
          ? (fetched as Account<Dispute>)
          : null;
      if (snapshot === null) return total;
      const fired = await reconcileOnce({
        ...config,
        fetchDisputes: async () => [snapshot],
        // A single dispute never has PendingUpdates, and the Canon/Reclaim/
        // Synod scans are noise on this path — neutralize them so the scoped
        // dispatch stays two RPC reads + at most one tx.
        fetchPendingUpdates: async () => [],
        fetchAccordState: async () => null,
        fetchReclaimableSlots: async () => [],
        fetchCanonItems: async () => [],
        fetchCanonLists: async () => [],
        fetchRemovedCanonItems: async () => [],
        fetchSynodCases: async () => [],
      });
      total += fired;
      if (fired === 0) return total; // nothing resolved — settled
    }
    return total;
  })();
  scopedInflight.set(key, run);
  try {
    return await run;
  } finally {
    scopedInflight.delete(key);
  }
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
      (config.log ?? defaultLog)("reconcile cycle failed", { error: formatError(e) });
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

async function fetchAppealBondAccount(
  rpc: Rpc<SolanaRpcApi>,
  dispute: Address,
  roundIdx: number,
): Promise<Account<AppealBond> | null> {
  const [pda] = await findAppealBondPda({ dispute, roundIdx });
  const maybe = await fetchMaybeAppealBond(rpc, pda);
  if (maybe.exists) return maybe;
  return null;
}

/** Default SDK AccordState fetch: derive the singleton PDA, read + decode, null if absent. */
async function fetchAccordStateAccount(
  rpc: Rpc<SolanaRpcApi>,
): Promise<Account<AccordState> | null> {
  const [pda] = await findAccordStatePda({});
  const maybe = await fetchMaybeAccordState(rpc, pda);
  if (maybe.exists) return maybe as Account<AccordState>;
  return null;
}

/**
 * Default reclaimable-slot scan: fetch all Subaccords, then for each fetch
 * its JurorStakes and filter for fully-drained accounts not yet reclaimed
 * (RECLAIM-LEAF). Returns at most one per subaccord (one reclaim per cycle).
 */
async function scanReclaimableSlots(rpc: Rpc<SolanaRpcApi>): Promise<ReclaimableSlot[]> {
  const subs = await findAllSubaccords(rpc);
  const result: ReclaimableSlot[] = [];
  for (const sub of subs) {
    const stakes = await findJurorStakesBySubaccord(rpc, sub.address);
    for (const s of stakes) {
      const d = s.data;
      if (
        d.staked === 0n &&
        d.activeDraws === 0 &&
        d.stakeDelta === 0n &&
        d.feesEarned === 0n &&
        d.nextFree === UINT32_MAX
      ) {
        result.push({ subaccord: sub.address, jurorStake: s.address });
        break; // one reclaim per subaccord per cycle
      }
    }
  }
  return result;
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

// The shared stamped sink (src/log.ts) — same shape the old local copy had.
const defaultLog = log;
