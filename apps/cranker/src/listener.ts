/**
 * listener.ts — WebSocket latency optimization for the cranker reconciler
 * (milestone accord-27r5 §2), generic over the watched program + account
 * filters (bean accord-m5fd parameterized it for the canon GC module).
 *
 * Subscribes to **accounts owned by one program** via `programSubscribe`,
 * filtered server-side by memcmp filters (default: the Accord Dispute
 * discriminator), and drives the target the instant an account changes. The
 * reconciler poll loop (60s) stays authoritative; this only closes the
 * latency gap.
 *
 * Why a discriminator-filtered account subscription (replacing the old
 * program-logs scraper): only the watched account family arrives, so the log
 * regex + address blacklist are gone — no ComputeBudget / VRF / system-program
 * noise. Every crank-actionable transition (create, VRF freeze, draw-complete,
 * commit, reveal-flip, finalize, appeal, redraw, cancel) writes the Dispute
 * account, so the subscription fires for each. The last-per-round reveal
 * writes only the Round; that one is picked up by the 60s poll — including
 * the early finalize once every juror has revealed (ADR-0021 + the
 * finalize-on-full-reveal gate). The canon variant watches CanonItem accounts
 * with an extra `state == Removed` memcmp, so only GC-eligible items arrive.
 */
import {
  type Address,
  type Base64EncodedBytes,
  type Commitment,
  getBase64Decoder,
  type GetProgramAccountsMemcmpFilter,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { DISPUTE_DISCRIMINATOR } from "@useaccord/sdk";

import { log } from "./log.js";

/**
 * What the listener drives on account activity. Declared here, not imported,
 * so this module compiles standalone and stays decoupled from the
 * reconciler's concrete implementation.
 */
export interface ListenerTarget {
  /** Act on one account notification (latency path). */
  onAccount(address: Address): Promise<void>;
  /** Full sweep on reconnect to close the gap. */
  onResubscribe(): Promise<void>;
}

export interface ProgramAccountListenerOptions {
  /** A subscriptions client built from `ACCORD_WS_URL` (see `.env.example`). */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** The program id to watch (`ACCORD_PROGRAM_ID` from the SDK). */
  programId: Address;
  /** What each notification drives (the reconciler, or the canon GC dispatch). */
  target: ListenerTarget;
  /**
   * Server-side memcmp filters restricting the subscription to one account
   * family. Default: the Accord Dispute discriminator at offset 0.
   */
  filters?: readonly GetProgramAccountsMemcmpFilter[];
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

/** The default subscription filters: Dispute accounts only. */
export const DISPUTE_FILTERS: readonly GetProgramAccountsMemcmpFilter[] = [
  { memcmp: { offset: 0n, bytes: DISPUTE_FILTER_BYTES, encoding: "base64" } },
];

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
 * Subscribes to a program's accounts (server-side filtered) and drives the
 * target on every notification.
 *
 * Construct with explicit options (the service entry wires `ACCORD_WS_URL` →
 * `rpcSubscriptions`); call {@link ProgramAccountListener.start} to begin, and
 * {@link ProgramAccountListener.stop} for a clean shutdown.
 */
export class ProgramAccountListener {
  private readonly opts: {
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
    programId: Address;
    target: ListenerTarget;
    filters: readonly GetProgramAccountsMemcmpFilter[];
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
      target: options.target,
      filters: options.filters ?? DISPUTE_FILTERS,
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
   * `onResubscribeFirst` triggers a full sweep on reconnect to close the gap.
   */
  private async subscribeOnce(onResubscribeFirst: boolean): Promise<void> {
    const stream = await this.opts.rpcSubscriptions
      .programNotifications(this.opts.programId, {
        commitment: this.opts.commitment,
        // Server-side filters: the RPC only delivers the watched account
        // family (e.g. Dispute accounts, or Removed CanonItems for the GC).
        filters: this.opts.filters,
      })
      .subscribe({ abortSignal: this.abort.signal });

    this.opts.log(`[listener] subscribed to ${this.opts.programId} accounts`);

    if (onResubscribeFirst) {
      this.opts.log("[listener] reconnect: triggering full reconcile");
      void this.opts.target
        .onResubscribe()
        .catch((e) => this.opts.log(`[listener] resubscribe sweep failed: ${stringifyErr(e)}`));
    }

    for await (const notification of stream) {
      // fire-and-forget; the target is idempotent. Never block/await here
      // — a slow or failed action must not stall the account stream.
      const address = notification.value.pubkey;
      this.opts.log(`[listener] account -> dispatch ${address}`);
      void this.opts.target
        .onAccount(address)
        .catch((e) => this.opts.log(`[listener] onAccount ${address} failed: ${stringifyErr(e)}`));
    }
  }
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
