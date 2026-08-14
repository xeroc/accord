/**
 * @useaccord/cranker — service entry point (milestone accord-27r5).
 *
 * Boots the full pipeline: funded keypair → Accord facade → dispatch map (all
 * 10 cranks registered) → 60s reconciler poll loop → WS program-log listener
 * (latency optimisation). Protocol-subsidized: the cranker keypair pays for
 * every crank tx.
 *
 * Env vars (see .env.example):
 *   ACCORD_RPC_URL         — JSON-RPC endpoint
 *   ACCORD_WS_URL          — WebSocket endpoint (program-log subscription)
 *   ACCORD_CRANKER_KEYPAIR — path to funded solana keypair JSON
 *   ACCORD_VRF_ORACLE_QUEUE — override the VRF oracle queue (optional)
 */
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Account,
  type Address,
} from "@solana/kit";
import {
  Accord,
  fetchMaybeDispute,
  findProgramIdentityPda,
  VRF_ORACLE_QUEUE,
  VRF_ORACLE_TEST_QUEUE,
  type Dispute,
} from "@useaccord/sdk";

import { createCrankDispatch } from "./dispatch.js";
import { ProgramAccountListener } from "./listener.js";
import { reconcileOnce, startReconciler, type ReconcilerConfig } from "./reconciler.js";
import { register as registerAccordCancelDispute } from "./cranks/accord/cancel-dispute.js";
import { register as registerAccordClaimRefund } from "./cranks/accord/claim-refund.js";
import { registerDrawSeatCrank as registerAccordDrawSeat } from "./cranks/accord/draw-seat.js";
import { register as registerAccordExecuteUnpause } from "./cranks/accord/execute-unpause.js";
import { register as registerAccordExecuteUpdate } from "./cranks/accord/execute-update.js";
import { register as registerAccordFinalizeDispute } from "./cranks/accord/finalize-dispute.js";
import { register as registerAccordFinalizeRound } from "./cranks/accord/finalize-round.js";
import { register as registerAccordReclaimSlot } from "./cranks/accord/reclaim-slot.js";
import { register as registerAccordRedraw } from "./cranks/accord/redraw.js";
import { register as registerAccordRequestVrf } from "./cranks/accord/request-vrf.js";
import { register as registerAccordSettleRound } from "./cranks/accord/settle-round.js";
import { register as registerCanonAdvancePending } from "./cranks/canon/advance-pending.js";
import { register as registerCanonAdvanceWithdrawal } from "./cranks/canon/advance-withdrawal.js";
import { register as registerCanonSettleItem } from "./cranks/canon/settle-item.js";
import { loadCrankerWallet } from "./wallet.js";
import { log } from "./log.js";

/** Build a dispatch with every crank registered (11 Accord + 3 Canon). */
function fullDispatch() {
  const d = createCrankDispatch();
  // Accord — the host program (dispute lifecycle, timelocks, refunds).
  registerAccordRequestVrf(d);
  registerAccordDrawSeat(d);
  registerAccordFinalizeRound(d);
  registerAccordFinalizeDispute(d);
  registerAccordSettleRound(d);
  registerAccordCancelDispute(d);
  registerAccordRedraw(d);
  registerAccordExecuteUpdate(d);
  registerAccordExecuteUnpause(d);
  registerAccordReclaimSlot(d);
  registerAccordClaimRefund(d);
  // Canon — the Arbitrable guest program (curated-item lifecycle).
  registerCanonAdvancePending(d);
  registerCanonSettleItem(d);
  registerCanonAdvanceWithdrawal(d);
  return d;
}

/** Pick the VRF oracle queue: explicit env override, else auto-detect localnet. */
function resolveOracleQueue(rpcUrl: string, env: Record<string, string | undefined>): Address {
  const explicit = env.ACCORD_VRF_ORACLE_QUEUE;
  if (explicit !== undefined && explicit.trim().length > 0) {
    return explicit as Address;
  }
  const isLocal = /127\.0\.0\.1|localhost/.test(rpcUrl);
  return (isLocal ? VRF_ORACLE_TEST_QUEUE : VRF_ORACLE_QUEUE) as Address;
}

async function main(): Promise<void> {
  const rpcUrl = process.env.ACCORD_RPC_URL;
  if (rpcUrl === undefined || rpcUrl.trim().length === 0) {
    throw new Error("Missing required env var: ACCORD_RPC_URL");
  }
  const wsUrl = process.env.ACCORD_WS_URL;
  if (wsUrl === undefined || wsUrl.trim().length === 0) {
    throw new Error("Missing required env var: ACCORD_WS_URL");
  }

  // 1. Raw RPC for the wallet balance probe (before the facade exists).
  const probeRpc = createSolanaRpc(rpcUrl);
  const wallet = await loadCrankerWallet(process.env, probeRpc);

  // 2. Construct the SDK facade (owns the RPC + signer + adapter).
  const accord = new Accord({ endpoint: rpcUrl, signer: wallet.signer });

  // 3. Resolve VRF oracle + program identity PDAs.
  const oracleQueue = resolveOracleQueue(rpcUrl, process.env);
  const [programIdentity] = await findProgramIdentityPda({});

  // 4. Build the dispatch map with every crank registered.
  const dispatch = fullDispatch();

  // 5. WebSocket subscriptions (program-log listener).
  const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);

  // 6. Assemble the reconciler config.
  const config: ReconcilerConfig = {
    accord,
    rpcSubscriptions,
    wallet,
    dispatch,
    oracleQueue,
    programIdentity,
    log,
  };

  // 7. Start the 60s poll loop (fires immediately on boot).
  const reconcilerHandle = startReconciler(config);
  log("cranker started", {
    address: wallet.address,
    rpcUrl,
    wsUrl,
    oracleQueue,
    programIdentity,
  });

  // 8. Start the WS listener (latency optimisation — triggers immediate
  //    reconcile on Dispute account changes; 60s poll is authoritative regardless).
  const listener = new ProgramAccountListener({
    rpcSubscriptions,
    programId: Accord.PROGRAM_ID,
    reconciler: {
      // Full sweep — used on reconnect to close the gap.
      reconcileAll: async () => {
        await reconcileOnce(config);
      },
      // Scoped sweep — just the one dispute the log event mentioned.
      reconcileDispute: async (addr: Address) => {
        const maybe = await fetchMaybeDispute(accord.rpc, addr);
        if (!maybe.exists) return;
        await reconcileOnce({
          ...config,
          fetchDisputes: async () => [maybe as Account<Dispute>],
          fetchPendingUpdates: async () => [],
        });
      },
    },
    log: (msg: string) => log(msg),
  });
  listener.start();

  // 9. Graceful shutdown.
  const shutdown = (): void => {
    log("cranker shutting down");
    reconcilerHandle.stop();
    listener.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

await main();
