/**
 * listener.ts — WebSocket latency optimization for the cranker reconciler
 * (bean accord-gbxm, epic accord-z9nc).
 *
 * Subscribes to Accord program logs via `logsNotifications({ mentions: [programId] })`.
 * On every program event, best-effort extracts dispute addresses from the log
 * lines and reconciles them immediately. The reconciler's own 60s poll is
 * authoritative — this is a pure latency optimization that runs alongside it.
 *
 * On WS error/disconnect: logs a warning and reconnects with capped exponential
 * backoff. The reconciler's poll keeps advancing disputes regardless (it is the
 * fallback). On every reconnect a full reconcile is triggered to close the gap.
 *
 * Per-dispute reconcile calls are fire-and-forget: one slow or failed reconcile
 * must never block the log stream. The reconciler is idempotent (re-reads state,
 * only acts when an action is due), so a few extra no-op calls — including for
 * addresses that aren't disputes — are harmless and expected, because the log
 * parse is intentionally best-effort and not authoritative.
 */
import {
  createSolanaRpcSubscriptions,
  type Address,
  type Commitment,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

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

export interface ProgramLogListenerOptions {
  /** A subscriptions client built from `ACCORD_WS_URL` (see `.env.example`). */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** The Accord program id to watch (`ACCORD_PROGRAM_ID` from the SDK). */
  programId: Address;
  /** The reconciler the listener drives. */
  reconciler: ReconcilerTarget;
  /** Commitment level for the log subscription. Default `"confirmed"`. */
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
const ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const IGNORE_DISPUTE_ADDRESSES = [
  "ComputeBudget111111111111111111111111111111",
  "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz",
  "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed",
  "11111111111111111111111111111111",
];

/**
 * Best-effort: pull Solana base58 address candidates out of raw log lines.
 * A real dispute PDA appears here when the program logs/mentions it; other
 * matches (program ids, system programs) are passed to the reconciler as
 * no-ops. Duplicates within one notification are de-duplicated.
 */
export function extractDisputeCandidates(logs: readonly string[]): Address[] {
  const seen = new Set<string>();
  for (const line of logs) {
    const matches = line.match(ADDRESS_RE);
    if (!matches) continue;
    for (const m of matches) {
      if (!seen.has(m)) seen.add(m);
    }
  }
  return [...seen].map((a) => a as Address);
}

/** Default capped-exponential backoff: 1s, 2s, 4s, … capped at 30s. */
function defaultBackoff(attempt: number): number {
  return Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Subscribes to Accord program logs and drives immediate reconciliation.
 *
 * Construct with explicit options (the service entry wires `ACCORD_WS_URL` →
 * `rpcSubscriptions`); call {@link ProgramLogListener.start} to begin, and
 * {@link ProgramLogListener.stop} for a clean shutdown.
 */
export class ProgramLogListener {
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

  constructor(options: ProgramLogListenerOptions) {
    this.opts = {
      rpcSubscriptions: options.rpcSubscriptions,
      programId: options.programId,
      reconciler: options.reconciler,
      commitment: options.commitment ?? "confirmed",
      log: options.log ?? ((m) => console.log(m)),
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
          `[listener] WS disconnected: ${stringifyErr(err)} — ` +
          `reconnecting in ${delay}ms (60s poll loop carries on regardless)`,
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
      .logsNotifications({ mentions: [this.opts.programId] }, { commitment: this.opts.commitment })
      .subscribe({ abortSignal: this.abort.signal });

    this.opts.log(`[listener] subscribed to ${this.opts.programId} logs`);

    if (reconcileAllFirst) {
      this.opts.log("[listener] reconnect: triggering full reconcile");
      void this.opts.reconciler
        .reconcileAll()
        .catch((e) => this.opts.log(`[listener] reconcileAll failed: ${stringifyErr(e)}`));
    }

    for await (const notification of stream) {
      this.dispatch(notification.value.logs);
    }
  }

  /** Parse the log lines and fire one reconcile per candidate dispute address. */
  private dispatch(logs: readonly string[]): void {
    for (const address of extractDisputeCandidates(logs)) {
      if (IGNORE_DISPUTE_ADDRESSES.includes(address)) continue;

      this.opts.log(`[listener] event -> reconcile ${address}`);
      // ponytail: fire-and-forget; reconciler is idempotent. Never block/await
      // here — a slow or failed reconcile must not stall the log stream.
      void this.opts.reconciler
        .reconcileDispute(address)
        .catch((e) =>
          this.opts.log(`[listener] reconcileDispute ${address} failed: ${stringifyErr(e)}`),
        );
    }
  }
}

/** Build a `rpcSubscriptions` client from a `ws://` / `wss://` URL. */
export function createListenerSubscriptions(
  wsUrl: string,
): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  return createSolanaRpcSubscriptions(wsUrl);
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
