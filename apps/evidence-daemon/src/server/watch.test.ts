/**
 * WS /watch/{dispute} contract (bean accord-heqb, ADR-0037).
 *
 * Real sockets against a real Bun.serve: connect mid-duty → hello + replay
 * (store tail + ring buffer, seal-filtered) → live frames; sealed verdict
 * frames withheld on live send AND replay until unsealAt (then flushed by the
 * unseal scheduler); per-IP connection cap; ping keepalive spares live
 * clients. The hub's publish() is the ingest entry (wired with the POST
 * route, bean accord-lmcc).
 *
 * Wall-clock note: fake timers cannot drive real socket I/O, and the unseal
 * scheduler arms platform timers at wall-clock unsealAt instants — these are
 * the integration tests that deliberately exercise real timer behavior
 * against the platform clock. Every wait is condition-driven (a frame count
 * or a close event); the only fixed delay is the keepalive cycle below.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { WatchHub, type WatchSocketData, watchRoutes, websocketHandlers } from "./watch.js";
import type { TraceEnvelope } from "./handlers.js";
import type { TraceReplaySource } from "./trace.js";

const DISPUTE = "1111111111111111111111111111111D";
const JUROR = "1111111111111111111111111111111J";

/** Frames a client can receive: the hello ack or a trace envelope. */
type WatchFrame = TraceEnvelope | { readonly type: "hello"; readonly dispute: string };

const isEnvelope = (f: WatchFrame): f is TraceEnvelope => "seq" in f;

/** Hello ack frames key by `type`; trace envelopes key by `seq`. */
const isHello = (f: WatchFrame | undefined): boolean => f !== undefined && "type" in f;

const seqs = (frames: WatchFrame[]): number[] => frames.filter(isEnvelope).map((f) => f.seq);

const servers: Bun.Server<WatchSocketData>[] = [];
const sockets: WebSocket[] = [];

afterEach(() => {
  for (const s of sockets) s.close();
  sockets.length = 0;
  for (const s of servers) s.stop(true);
  servers.length = 0;
});

function envelope(seq: number, event: Record<string, unknown>): TraceEnvelope {
  return { v: 1, at: 1_700_000_000_000 + seq, seq, juror: JUROR, dispute: DISPUTE, event };
}

/** Start a watch server on an ephemeral port. */
function serve(hub: WatchHub): Bun.Server<WatchSocketData> {
  const app = new Hono();
  // eslint-disable-next-line prefer-const -- closure reads the binding before its assignment (TDZ)
  let server: Bun.Server<WatchSocketData> | undefined;
  app.route(
    "/",
    watchRoutes(hub, () => server),
  );
  server = Bun.serve<WatchSocketData>({
    port: 0,
    fetch: app.fetch,
    websocket: websocketHandlers(hub),
  });
  servers.push(server);
  return server;
}

/** Connect a WS client and buffer parsed frames. */
function connect(server: Bun.Server<WatchSocketData>, path = `/watch/${DISPUTE}`) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}${path}`);
  sockets.push(ws);
  const frames: WatchFrame[] = [];
  const waiters: Array<() => void> = [];
  const closed = Promise.withResolvers<void>();
  const open = Promise.withResolvers<void>();
  ws.addEventListener("close", () => closed.resolve());
  ws.addEventListener("open", () => open.resolve());
  ws.addEventListener("message", (ev) => {
    frames.push(JSON.parse(ev.data));
    for (const w of waiters) w();
    waiters.length = 0;
  });
  return {
    ws,
    frames,
    closed: closed.promise,
    open: open.promise,
    /** Resolve once at least n frames arrived. The setTimeout is a hang
     * guard (test deadline), not a sleep — arrival wakes the waiter early. */
    async atLeast(n: number, ms = 2_000): Promise<WatchFrame[]> {
      const deadline = Date.now() + ms;
      while (frames.length < n) {
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new Error(`timeout: ${frames.length}/${n} frames: ${JSON.stringify(frames)}`);
        }
        const wake = Promise.withResolvers<void>();
        waiters.push(() => wake.resolve());
        const guard = setTimeout(() => wake.resolve(), left);
        await wake.promise;
        clearTimeout(guard);
      }
      return frames;
    },
  };
}

describe("WS /watch/:dispute", () => {
  it("mid-duty connect: hello + ring replay + live, seq-ordered", async () => {
    const hub = new WatchHub();
    const server = serve(hub);

    const a = connect(server);
    await a.open;
    await a.atLeast(1); // hello

    hub.publish(DISPUTE, [envelope(1, { type: "agent-start", model: "m" })]);
    hub.publish(DISPUTE, [envelope(2, { type: "step", n: 1 })]);
    expect(seqs(await a.atLeast(3))).toEqual([1, 2]);

    // Mid-duty connect: hello + replay of the ring, then live.
    const b = connect(server);
    const bFrames = await b.atLeast(3);
    expect(isHello(bFrames[0])).toBe(true);
    expect(seqs(bFrames)).toEqual([1, 2]);

    hub.publish(DISPUTE, [envelope(3, { type: "commit", dryRun: true })]);
    expect(seqs(await a.atLeast(4))).toEqual([1, 2, 3]);
    expect(seqs(await b.atLeast(4))).toEqual([1, 2, 3]);
  });

  it("replay = store tail, then ring tail (no duplicates), then live", async () => {
    const source: TraceReplaySource = {
      // Durable record already carries seq 1 (published before this process).
      readEvents: () => Promise.resolve([envelope(1, { type: "agent-start", model: "m" })]),
    };
    const hub = new WatchHub({ replay: source });
    const server = serve(hub);

    // Live-published frame is in the ring, not in the (static) store fake.
    hub.publish(DISPUTE, [envelope(2, { type: "step", n: 1 })]);

    const c = connect(server);
    const frames = await c.atLeast(3);
    expect(isHello(frames[0])).toBe(true);
    expect(seqs(frames)).toEqual([1, 2]); // store seq 1, ring seq 2 — no dupes

    hub.publish(DISPUTE, [envelope(3, { type: "reveal", tx: "sig" })]);
    expect(seqs(await c.atLeast(4))).toEqual([1, 2, 3]);
  });

  it("sealed verdict: withheld live + on replay, flushed at unsealAt", async () => {
    const hub = new WatchHub();
    const server = serve(hub);
    const unsealAt = Date.now() + 400;

    const a = connect(server);
    await a.open;
    await a.atLeast(1);

    hub.publish(DISPUTE, [
      envelope(1, { type: "step", n: 1 }),
      envelope(2, { type: "verdict", optionIndex: 0, unsealAt }),
    ]);
    // Live: only the step arrives; the verdict stays sealed.
    expect(seqs(await a.atLeast(2))).toEqual([1]);

    // Replay path (mid-window connect): sealed verdict still withheld.
    const b = connect(server);
    expect(seqs(await b.atLeast(2))).toEqual([1]);

    // After unsealAt: the platform timer flushes to live sockets...
    expect(seqs(await a.atLeast(3, 3_000))).toEqual([1, 2]);
    // ...and later connects see it via the ring (seal-check at send time).
    const c = connect(server);
    expect(seqs(await c.atLeast(3, 2_000))).toEqual([1, 2]);
  });

  it("per-IP cap: second connection from the same IP is dropped", async () => {
    const hub = new WatchHub({ maxClientsPerIp: 1 });
    const server = serve(hub);

    const a = connect(server);
    await a.open;

    const b = connect(server);
    await b.closed; // upgrade rejected over the cap
    expect(hub.subscriberCount(DISPUTE)).toBe(1);
  });

  it("publish with no subscribers buffers in the ring without throwing", async () => {
    const hub = new WatchHub();
    const server = serve(hub);

    hub.publish(DISPUTE, [envelope(1, { type: "agent-start", model: "m" })]);
    hub.publish(DISPUTE, [envelope(2, { type: "step", n: 1 })]);

    const late = connect(server);
    expect(seqs(await late.atLeast(3))).toEqual([1, 2]);
  });

  it("ping keepalive spares a live (pong-ing) client", async () => {
    const hub = new WatchHub({ pingIntervalMs: 50 });
    const server = serve(hub);

    const a = connect(server);
    await a.open;
    await a.atLeast(1);
    // Real delay by necessity: protocol pings/pongs are invisible to the WS
    // client API, so several keepalive cycles must pass on the platform clock.
    const wake = Promise.withResolvers<void>();
    setTimeout(() => wake.resolve(), 200);
    await wake.promise;

    hub.publish(DISPUTE, [envelope(1, { type: "step", n: 1 })]);
    expect(seqs(await a.atLeast(2))).toEqual([1]); // still connected + receiving
  });

  it("ring is bounded (drop-oldest) at bufferPerDispute", async () => {
    const hub = new WatchHub({ bufferPerDispute: 2 });
    const server = serve(hub);

    hub.publish(DISPUTE, [envelope(1, { type: "step", n: 1 })]);
    hub.publish(DISPUTE, [envelope(2, { type: "step", n: 2 })]);
    hub.publish(DISPUTE, [envelope(3, { type: "step", n: 3 })]);

    const c = connect(server);
    expect(seqs(await c.atLeast(3))).toEqual([2, 3]); // seq 1 dropped, order kept
  });
});
