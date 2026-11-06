/**
 * listener.test.ts — self-checks for the WS account listener (bean
 * accord-gbxm; parameterized for arbitrary programs/filters in accord-m5fd).
 *
 * Pins the three things the live loop depends on:
 *   - the default discriminator filter is built from the generated Dispute
 *     discriminator (so the subscription only delivers Dispute accounts);
 *   - caller-supplied filters (canon GC: discriminator + Removed state) are
 *     forwarded verbatim to `programNotifications`;
 *   - the listener fires one `onAccount` per account notification and is
 *     start/stop-safe.
 * The real reconnect loop is exercised end-to-end by the reconciler e2e suite
 * (Surfpool); here we drive it with a fake subscription stream and await the
 * target calls directly (no wall-clock timers).
 */
import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import {
  createSolanaRpcSubscriptions,
  getBase64Encoder,
  getAddressEncoder,
  type Address,
  type GetProgramAccountsMemcmpFilter,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import type { Server } from "bun";
import { DISPUTE_DISCRIMINATOR } from "@useaccord/sdk";
import { ItemState } from "@useaccord/canon";
import { canonItemStateFilter, removedCanonItemFilters } from "../src/canon-gc";
import {
  DISPUTE_FILTER_BYTES,
  DISPUTE_FILTERS,
  ProgramAccountListener,
  VrfLogListener,
  vrfCommittedFromLogs,
} from "../src/listener";

const VRF_EVENT_DISC = createHash("sha256").update("event:VrfCommitted").digest().subarray(0, 8);

const PROGRAM_ID = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed" as Address;
const CANON_PROGRAM = "can5ZhfgQpi7jymkxE7uEv4ZVm3X2f51KThTUtdWrFs" as Address;
const DISPUTE_A = "DisputeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const DISPUTE_B = "DisputeBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as Address;

test("DISPUTE_FILTER_BYTES is the base64 of the generated Dispute discriminator", () => {
  // Round-trip: the filter bytes decode back to exactly DISPUTE_DISCRIMINATOR.
  expect(Array.from(getBase64Encoder().encode(DISPUTE_FILTER_BYTES))).toEqual(
    Array.from(DISPUTE_DISCRIMINATOR),
  );
});

/** Fake subs that capture the subscription config and yield two notifications. */
function fakeSubs(notifications: Address[]) {
  let seenConfig: { filters?: readonly GetProgramAccountsMemcmpFilter[] } | undefined;
  const subs = {
    programNotifications: (_programId: Address, config: { filters?: unknown }) => ({
      subscribe: async ({ abortSignal }: { abortSignal: AbortSignal }) => {
        seenConfig = config as { filters?: readonly GetProgramAccountsMemcmpFilter[] };
        return (async function* () {
          for (const pubkey of notifications) {
            yield { value: { pubkey, account: { data: ["", "base64"] } } };
          }
          await waitForAbort(abortSignal);
        })();
      },
    }),
  };
  return {
    subs: subs as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    seenConfig: () => seenConfig,
  };
}

/** An open, idle subscription stream: iterator that never resolves. */
function healthyStream(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.withResolvers<IteratorResult<never>>().promise,
    }),
  };
}

test("ProgramAccountListener forwards caller filters and fires onAccount per notification", async () => {
  const canonFilters = removedCanonItemFilters();
  const { subs, seenConfig } = fakeSubs([DISPUTE_A, DISPUTE_B]);
  const seen: Address[] = [];
  // Await the real signal — resolves once the second onAccount lands.
  const { promise: bothDone, resolve: signalBoth } = Promise.withResolvers<void>();
  const listener = new ProgramAccountListener({
    createRpcSubscriptions: () => subs,
    programId: CANON_PROGRAM,
    filters: canonFilters,
    target: {
      onAccount: async (a: Address) => {
        seen.push(a);
        if (seen.length >= 2) signalBoth();
      },
      onResubscribe: async () => {},
    },
  });
  listener.start();
  await bothDone;
  listener.stop();
  expect(seen).toEqual([DISPUTE_A, DISPUTE_B]);
  // The canon GC filters — discriminator + state == Removed memcmp — reach
  // the RPC subscription verbatim.
  expect(seenConfig()?.filters).toEqual(canonFilters);
  expect(canonFilters[1]?.memcmp.bytes).toBe(canonItemStateFilter(ItemState.Removed).memcmp.bytes);
});

test("ProgramAccountListener defaults to the Dispute discriminator filter", async () => {
  const { subs, seenConfig } = fakeSubs([DISPUTE_A]);
  const { promise: one, resolve: signalOne } = Promise.withResolvers<void>();
  const listener = new ProgramAccountListener({
    createRpcSubscriptions: () => subs,
    programId: PROGRAM_ID,
    target: {
      onAccount: async () => signalOne(),
      onResubscribe: async () => {},
    },
  });
  listener.start();
  await one;
  listener.stop();
  expect(seenConfig()?.filters).toEqual(DISPUTE_FILTERS);
});

/** Resolve when the abort signal fires (keeps the fake stream open like a real one). */
function waitForAbort(abortSignal: AbortSignal): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  if (abortSignal.aborted) resolve();
  else abortSignal.addEventListener("abort", () => resolve(), { once: true });
  return promise;
}

// --- VrfLogListener: the VrfCommitted event as a draw-seat trigger ----------

/** Anchor event framing: 8-byte event discriminator + borsh(dispute, vrf, root). */
function vrfCommittedDataLog(disputeAddr: Address): string {
  const bytes = new Uint8Array(8 + 96);
  bytes.set(VRF_EVENT_DISC, 0);
  bytes.set(getAddressEncoder().encode(disputeAddr), 8);
  return `Program data: ${Buffer.from(bytes).toString("base64")}`;
}

function fakeLogSubs(notifications: { err: unknown; logs: string[] }[]) {
  const subs = {
    logsNotifications: () => ({
      subscribe: async ({ abortSignal }: { abortSignal: AbortSignal }) =>
        (async function* () {
          for (const n of notifications) {
            yield { value: { signature: "sig", err: n.err, logs: n.logs } };
          }
          await waitForAbort(abortSignal);
        })(),
    }),
  };
  return subs as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

test("vrfCommittedFromLogs decodes the dispute out of the event framing", () => {
  expect(vrfCommittedFromLogs([vrfCommittedDataLog(PROGRAM_ID)])).toBe(PROGRAM_ID);
  expect(
    vrfCommittedFromLogs(["Program log: Instruction: RequestVrf", "Program data: not-an-event"]),
  ).toBeNull();
});

test("VrfLogListener dispatches the dispute on a matching event, ignores noise", async () => {
  const committed: Address[] = [];
  const { promise: done, resolve: signalDone } = Promise.withResolvers<void>();
  const listener = new VrfLogListener({
    createRpcSubscriptions: () =>
      fakeLogSubs([
        // A request_vrf tx with no event: ignored.
        { err: null, logs: ["Program log: Instruction: RequestVrf"] },
        // The callback tx carrying VrfCommitted: dispatched.
        {
          err: null,
          logs: [
            "Program cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed invoke [1]",
            vrfCommittedDataLog(PROGRAM_ID),
          ],
        },
        // A failed tx must not dispatch even if it logs the event.
        {
          err: { InstructionError: [0, { Custom: 1 }] },
          logs: [vrfCommittedDataLog(CANON_PROGRAM)],
        },
      ]),
    programId: PROGRAM_ID,
    target: {
      onCommitted: async (d) => {
        committed.push(d);
        signalDone();
      },
    },
  });
  listener.start();
  await done;
  listener.stop();
  expect(committed).toEqual([PROGRAM_ID]);
});

// --- Reconnect: a failed dial must never poison later attempts -------------
//
// kit's subscription-coalescing cache (`createSolanaRpcSubscriptions`) caches
// the REJECTED promise when the initial dial fails, keyed by (methodName,
// params) — that client never dials again for the same subscription. The
// listeners work around it by building a fresh client per connection attempt.

test(
  "ProgramAccountListener dials a fresh client per attempt and recovers",
  { timeoutMs: 5000 },
  async () => {
    const logs: string[] = [];
    let dials = 0;
    const { promise: healthyGate, resolve: heal } = Promise.withResolvers<void>();
    let healthy = false;
    const subs = {
      programNotifications: () => ({
        subscribe: async () => {
          if (!healthy) throw new Error("WebSocket failed to connect");
          return healthyStream();
        },
      }),
    };
    const { promise: failed, resolve: signalFailed } = Promise.withResolvers<void>();
    const { promise: subscribed, resolve: signalSubscribed } = Promise.withResolvers<void>();
    const listener = new ProgramAccountListener({
      createRpcSubscriptions: () => {
        dials += 1;
        return subs as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
      },
      programId: PROGRAM_ID,
      target: { onAccount: async () => {}, onResubscribe: async () => {} },
      log: (m) => {
        logs.push(m);
        if (m.includes("WS disconnected")) signalFailed();
        if (m.includes("subscribed")) signalSubscribed();
      },
      backoffMs: () => 0,
      // Gate (endpoint healed) + Bun.sleep(0) event-loop yield — not a duration
      // guess: the yield lets bun's per-test timeout fire while a pre-fix retry
      // loop spins synchronously.
      sleep: async () => {
        await healthyGate.promise;
        await Bun.sleep(0);
      },
    });
    listener.start();
    await failed; // first attempt failed (the transient outage)
    healthy = true;
    heal(); // release the backoff sleep — endpoint is back
    await subscribed; // second attempt, fresh client, subscribed
    listener.stop();
    expect(logs.some((l) => l.includes(`subscribed to ${PROGRAM_ID}`))).toBeTrue();
    expect(dials).toBeGreaterThanOrEqual(2);
  },
);

test(
  "VrfLogListener dials a fresh client per attempt and recovers",
  { timeoutMs: 5000 },
  async () => {
    const logs: string[] = [];
    let dials = 0;
    const { promise: healthyGate, resolve: heal } = Promise.withResolvers<void>();
    let healthy = false;
    const subs = {
      logsNotifications: () => ({
        subscribe: async () => {
          if (!healthy) throw new Error("WebSocket failed to connect");
          return healthyStream();
        },
      }),
    };
    const { promise: failed, resolve: signalFailed } = Promise.withResolvers<void>();
    const { promise: subscribed, resolve: signalSubscribed } = Promise.withResolvers<void>();
    const listener = new VrfLogListener({
      createRpcSubscriptions: () => {
        dials += 1;
        return subs as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
      },
      programId: PROGRAM_ID,
      target: { onCommitted: async () => {} },
      log: (m) => {
        logs.push(m);
        if (m.includes("WS disconnected")) signalFailed();
        if (m.includes("subscribed")) signalSubscribed();
      },
      backoffMs: () => 0,
      sleep: async () => {
        await healthyGate.promise;
        await Bun.sleep(0);
      },
    });
    listener.start();
    await failed;
    healthy = true;
    heal();
    await subscribed;
    listener.stop();
    expect(logs.some((l) => l.includes(`subscribed to ${PROGRAM_ID}`))).toBeTrue();
    expect(dials).toBeGreaterThanOrEqual(2);
  },
);
test(
  "ProgramAccountListener recovers against real kit after the endpoint comes back (coalescing-cache regression)",
  { timeoutMs: 10000 },
  async () => {
    // Real `@solana/kit` client + a fake WS endpoint that refuses, then serves.
    // With the pre-fix wiring (one process-lifetime client) the retry below
    // would be served kit's cached rejected promise and never dial again.
    // ponytail: this test does real socket I/O (refused TCP port, then the WS
    // upgrade) — deterministic fake timers cannot produce a dead endpoint.
    const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const port = probe.port;
    probe.stop(true);

    let connections = 0;
    let server: Server | undefined;
    const startServer = (): void => {
      if (server !== undefined) return;
      server = Bun.serve({
        port,
        hostname: "127.0.0.1",
        fetch(req, s) {
          return s.upgrade(req) ? undefined : new Response("no", { status: 400 });
        },
        websocket: {
          open() {
            connections += 1;
          },
          message(ws, msg) {
            const req = JSON.parse(String(msg)) as { id: number; method: string };
            if (req.method === "ping") return;
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: `sub-${req.id}` }));
          },
        },
      });
    };

    const logs: string[] = [];
    const { promise: subscribed, resolve: signalSubscribed } = Promise.withResolvers<void>();
    const listener = new ProgramAccountListener({
      createRpcSubscriptions: () => createSolanaRpcSubscriptions(`ws://127.0.0.1:${port}`),
      programId: PROGRAM_ID,
      target: { onAccount: async () => {}, onResubscribe: async () => {} },
      log: (m) => {
        logs.push(m);
        // The outage ends the moment the first dial failure is observed.
        if (m.includes("WS disconnected")) startServer();
        if (m.includes("subscribed")) signalSubscribed();
      },
      backoffMs: () => 0,
      sleep: async () => {
        // Bun.sleep(0) — event-loop yield, not a duration guess: lets bun's
        // per-test timeout fire while a pre-fix retry loop spins synchronously.
        await Bun.sleep(0);
      },
    });
    listener.start();
    await subscribed; // bun's per-test timeout is the hang safety net
    listener.stop();
    server?.stop(true);
    expect(logs.some((l) => l.includes(`subscribed to ${PROGRAM_ID}`))).toBeTrue();
    expect(connections).toBeGreaterThanOrEqual(1);
  },
);
