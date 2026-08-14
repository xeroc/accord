/**
 * listener.ts — WebSocket latency optimization for the cranker reconciler
 * (milestone accord-27r5 §2).
 *
 * Subscribes to **Dispute accounts owned by the Accord program** via
 * `programSubscribe`, filtered server-side by the Dispute discriminator, and
 * reconciles the referenced dispute the instant it changes. The reconciler
 * poll loop (60s) stays authoritative; this only closes the latency gap.
 *
 * Why a discriminator-filtered account subscription (replacing the old
 * program-logs scraper): only Dispute accounts arrive, so the log regex +
 * address blacklist are gone — no ComputeBudget / VRF / system-program noise.
 * Every crank-actionable transition (create, VRF freeze, draw-complete, commit,
 * reveal-flip, finalize, appeal, redraw, cancel) writes the Dispute account, so
 * the subscription fires for each. The last-per-round reveal writes only the
 * Round; that one is picked up by the 60s poll — including the early finalize
 * once every juror has revealed (ADR-0021 + the finalize-on-full-reveal gate).
 */
import {
  type Address,
  type Base64EncodedBytes,
  type Commitment,
  getBase64Decoder,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { DISPUTE_DISCRIMINATOR } from "@useaccord/sdk";

import { log } from "./log.js";

/**
 * The surface the listener needs from the reconciler (bean accord-rev4).
 * Declared here, not imported, so this module compiles standalone and stays
 * decoupled from the reconciler's concrete implementation.
 */
export interface ReconcilerTarget {
  /** Reconcile a single dispute immediately (latency path). */
  reconcileDispute(address: Address): Promise<void>;
  /** Reconcile all active disputes (fired on reconnect to close the gap). */
  reconcileAll(): Promise<void>;
}

export interface ProgramAccountListenerOptions {
  /** A subscriptions client built from `ACCORD_WS_URL` (see `.env.example`). */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** The Accord program id to watch (`ACCORD_PROGRAM_ID` from the SDK). */
  programId: Address;
  /** The reconciler the listener drives. */
  reconciler: ReconcilerTarget;
  /** Commitment level for the account subscription. Default `"confirmed"`. */
  commitment?: Commitment;
  /** Structured logger sink. Defaults to `console.log`. */
  log?: (msg: string) => void;
  /** Reconnect delay (ms) for a given 0-indexed attempt. Default: capped exp. */
  backoffMs?: (attempt: number) => number;
  /** Sleeper; overridable in tests. Default: `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * base64 of the Dispute discriminator — the `memcmp` bytes (compared at byte
 * offset 0) that restrict the subscription to Dispute accounts only. Built from
 * the generated `DISPUTE_DISCRIMINATOR` so it tracks the program's account
 * layout automatically (no hand-rolled bytes).
 */
export const DISPUTE_FILTER_BYTES: Base64EncodedBytes = getBase64Decoder().decode(
  DISPUTE_DISCRIMINATOR,
) as Base64EncodedBytes;

/** Default capped-exponential backoff: 1s, 2s, 4s, … capped at 30s. */
function defaultBackoff(attempt: number): number {
  return Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

function defaultSleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * Subscribes to Accord Dispute accounts and drives immediate reconciliation.
 *
 * Construct with explicit options (the service entry wires `ACCORD_WS_URL` →
 * `rpcSubscriptions`); call {@link ProgramAccountListener.start} to begin, and
 * {@link ProgramAccountListener.stop} for a clean shutdown.
 */
export class ProgramAccountListener {
  private readonly opts: {
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
    programId: Address;
    reconciler: ReconcilerTarget;
    commitment: Commitment;
    log: (msg: string) => void;
    backoffMs: (attempt: number) => number;
    sleep: (ms: number) => Promise<void>;
  };
  private readonly abort = new AbortController();
  private running = false;

  constructor(options: ProgramAccountListenerOptions) {
    this.opts = {
      rpcSubscriptions: options.rpcSubscriptions,
      programId: options.programId,
      reconciler: options.reconciler,
      commitment: options.commitment ?? "confirmed",
      log: options.log ?? ((m) => log(m)),
      backoffMs: options.backoffMs ?? defaultBackoff,
      sleep: options.sleep ?? defaultSleep,
    };
  }

  /** Begin the subscription loop (resolves immediately; runs in the background). */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.run();
  }

  /** Stop the listener and tear down the active subscription. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.abort.abort();
  }

  private async run(): Promise<void> {
    let attempt = 0;
    while (this.running) {
      try {
        await this.subscribeOnce(attempt > 0);
        // subscribeOnce only returns when the stream ends normally; reset backoff.
        attempt = 0;
      } catch (err) {
        if (!this.running) break; // aborted via stop()
        const delay = this.opts.backoffMs(attempt);
        this.opts.log(
          `[listener] WS disconnected: ${stringifyErr(err)} — reconnecting in ${delay}ms (60s poll loop carries on regardless)`,
        );
        attempt += 1;
        await this.opts.sleep(delay);
      }
    }
    this.opts.log("[listener] stopped");
  }

  /**
   * Open one subscription and pump it until it errors or is aborted.
   * `reconcileAllFirst` triggers a full sweep on reconnect to close the gap.
   */
  private async subscribeOnce(reconcileAllFirst: boolean): Promise<void> {
    const stream = await this.opts.rpcSubscriptions
      .programNotifications(this.opts.programId, {
        commitment: this.opts.commitment,
        // Discriminator filter: the RPC only delivers Dispute accounts, so we
        // never handle (or even receive) Round / JurorStake / Subaccord noise.
        filters: [{ memcmp: { offset: 0n, bytes: DISPUTE_FILTER_BYTES, encoding: "base64" } }],
      })
      .subscribe({ abortSignal: this.abort.signal });

    this.opts.log(`[listener] subscribed to ${this.opts.programId} dispute accounts`);

    if (reconcileAllFirst) {
      this.opts.log("[listener] reconnect: triggering full reconcile");
      void this.opts.reconciler
        .reconcileAll()
        .catch((e) => this.opts.log(`[listener] reconcileAll failed: ${stringifyErr(e)}`));
    }

    for await (const notification of stream) {
      // fire-and-forget; the reconciler is idempotent. Never block/await here
      // — a slow or failed reconcile must not stall the account stream.
      const address = notification.value.pubkey;
      this.opts.log(`[listener] account -> reconcile ${address}`);
      void this.opts.reconciler
        .reconcileDispute(address)
        .catch((e) =>
          this.opts.log(`[listener] reconcileDispute ${address} failed: ${stringifyErr(e)}`),
        );
    }
  }
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
