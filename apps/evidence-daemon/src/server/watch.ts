/**
 * WS /watch/{dispute} — live jury-telemetry fan-out (ADR-0037, bean
 * accord-heqb). Replay-then-live with seal-on-read on every send.
 *
 *   connect → hello → replay (store tail ∪ ring buffer, seal-filtered,
 *             deduped by juror:seq) → live frames
 *   publish(dispute, envelopes) — the ingest entry (POST /trace, bean
 *             accord-lmcc): ring (bounded, drop-oldest) + immediate
 *             seal-visible send; sealed frames arm an unseal timer that
 *             re-fans out at unsealAt
 *
 * Read gate (ADR-0037): the optional `authorize` seam runs BEFORE the IP
 * slot is reserved or the socket upgrades — false ⇒ 401 JSON. main.ts wires
 * it to the same rule as GET /trace: the durable public stamp (flipped by
 * jurat via POST /trace-public) OR a valid filer token from `?token=`
 * (browsers cannot
 * header a WS upgrade). Absent ⇒ ungated (pre-gate deployments).
 *
 * Fan-out state is single-replica in-memory (ADR-0037 locked decision);
 * durable replay is the store (GET /trace works on any replica). WS ignores
 * CORS; the per-IP connection cap is hygiene, not auth.
 */
import { Hono } from "hono";
import type { ServerWebSocket } from "bun";
import type { TraceEnvelope } from "./handlers.js";
import { ADDRESS } from "./routes.js";
import type { TraceReplaySource } from "./trace.js";
import { UnsealScheduler, sealVisible } from "../pipeline/seal.js";

/** Upgrade payload → `ws.data`. */
export interface WatchSocketData {
  readonly dispute: string;
  readonly ip: string;
  /** Keepalive latch: set on open/pong, cleared by each ping sweep. */
  alive: boolean;
}

export interface WatchOptions {
  /** Ring buffer frames per dispute (env `TRACE_BUFFER_PER_DISPUTE`). */
  readonly bufferPerDispute?: number;
  /** Concurrent watch connections per peer IP (env `TRACE_MAX_CLIENTS_PER_IP`). */
  readonly maxClientsPerIp?: number;
  /** Ping sweep interval; sockets that missed their pong are terminated. */
  readonly pingIntervalMs?: number;
  /** Durable store tail for catch-up replay (fs/s3 TraceStore read side). */
  readonly replay?: TraceReplaySource;
}

const DEFAULT_BUFFER = 512;
const DEFAULT_MAX_CLIENTS = 8;
const DEFAULT_PING_MS = 30_000;

/** Scheduler adapter: envelopes aren't Sealable — their events are. */
interface SealedEnvelope {
  readonly unsealAt: number;
  readonly envelope: TraceEnvelope;
}

const dedupeKey = (env: TraceEnvelope): string => `${env.juror}:${env.seq}`;

export class WatchHub {
  private readonly subscribers = new Map<string, Set<ServerWebSocket<WatchSocketData>>>();
  private readonly ring = new Map<string, TraceEnvelope[]>();
  private readonly ipCounts = new Map<string, number>();
  private readonly keepalive: Timer;
  private readonly scheduler = new UnsealScheduler<SealedEnvelope>((dispute, sealed) => {
    this.send(dispute, sealed.envelope);
  });

  constructor(private readonly opts: WatchOptions = {}) {
    this.keepalive = setInterval(() => {
      for (const set of this.subscribers.values()) for (const ws of set) this.sweep(ws);
    }, opts.pingIntervalMs ?? DEFAULT_PING_MS);
    // Don't hold the process open for the ping sweep alone.
    this.keepalive.unref();
  }

  /**
   * Ingest entry: buffer + fan out. Visible frames go out immediately;
   * sealed frames arm the unseal timer. Never throws — a fan-out failure
   * must not stall the ingest pipeline.
   */
  publish(dispute: string, envelopes: readonly TraceEnvelope[]): void {
    const ring = this.ringFor(dispute);
    const now = Date.now();
    for (const env of envelopes) {
      ring.push(env);
      if (ring.length > (this.opts.bufferPerDispute ?? DEFAULT_BUFFER)) ring.shift();
      if (sealVisible(env.event, now)) {
        this.send(dispute, env);
      } else {
        const unsealAt = env.event.unsealAt;
        if (unsealAt !== undefined) this.scheduler.track(dispute, { unsealAt, envelope: env });
      }
    }
  }

  subscriberCount(dispute: string): number {
    return this.subscribers.get(dispute)?.size ?? 0;
  }

  /** Cancel unseal timers + keepalive sweep (shutdown). */
  dispose(): void {
    clearInterval(this.keepalive);
    this.scheduler.dispose();
  }

  /** Per-IP slot reservation at upgrade time (atomic with the cap check). */
  reserveIp(ip: string): boolean {
    const max = this.opts.maxClientsPerIp ?? DEFAULT_MAX_CLIENTS;
    const count = this.ipCounts.get(ip) ?? 0;
    if (count >= max) return false;
    this.ipCounts.set(ip, count + 1);
    return true;
  }

  releaseIp(ip: string): void {
    const count = this.ipCounts.get(ip) ?? 0;
    if (count <= 1) this.ipCounts.delete(ip);
    else this.ipCounts.set(ip, count - 1);
  }

  /** Hello + replay (store tail ∪ ring, seal-filtered) then go live. */
  async onOpen(ws: ServerWebSocket<WatchSocketData>): Promise<void> {
    const { dispute } = ws.data;
    ws.send(JSON.stringify({ type: "hello", dispute }));

    let storeFrames: readonly TraceEnvelope[] = [];
    try {
      storeFrames = (await this.opts.replay?.readEvents(dispute)) ?? [];
    } catch {
      // Store down → ring still serves; the durable record takes the gap.
    }

    // Synchronous tail: a publish() cannot interleave between the ring walk
    // and the subscribe, so no live frame is missed or double-sent.
    const seen = new Set<string>();
    for (const env of storeFrames) {
      if (this.sendTo(ws, env)) seen.add(dedupeKey(env));
    }
    for (const env of this.ring.get(dispute) ?? []) {
      if (!seen.has(dedupeKey(env))) this.sendTo(ws, env);
    }
    this.subscribe(ws);
  }

  onClose(ws: ServerWebSocket<WatchSocketData>): void {
    const set = this.subscribers.get(ws.data.dispute);
    if (set !== undefined && set.delete(ws)) {
      if (set.size === 0) this.subscribers.delete(ws.data.dispute);
      this.releaseIp(ws.data.ip);
    }
  }

  /** Keepalive sweep: terminate sockets that missed their pong, ping the rest. */
  sweep(ws: ServerWebSocket<WatchSocketData>): void {
    if (!ws.data.alive) {
      ws.terminate();
      return;
    }
    ws.data.alive = false;
    ws.ping();
  }

  private subscribe(ws: ServerWebSocket<WatchSocketData>): void {
    let set = this.subscribers.get(ws.data.dispute);
    if (set === undefined) {
      set = new Set();
      this.subscribers.set(ws.data.dispute, set);
    }
    set.add(ws);
  }

  private ringFor(dispute: string): TraceEnvelope[] {
    let ring = this.ring.get(dispute);
    if (ring === undefined) {
      ring = [];
      this.ring.set(dispute, ring);
    }
    return ring;
  }

  private send(dispute: string, env: TraceEnvelope): void {
    for (const ws of this.subscribers.get(dispute) ?? []) this.sendTo(ws, env);
  }

  /** The one send path — seal-check at send time; a dead socket never throws. */
  private sendTo(ws: ServerWebSocket<WatchSocketData>, env: TraceEnvelope): boolean {
    if (!sealVisible(env.event, Date.now())) return false;
    try {
      ws.send(JSON.stringify(env));
      return true;
    } catch {
      return false;
    }
  }
}

/** Bun.serve websocket handlers (pass to `Bun.serve<WatchSocketData>`). */
export function websocketHandlers(hub: WatchHub): Bun.WebSocketHandler<WatchSocketData> {
  return {
    open: (ws) => {
      ws.data.alive = true;
      void hub.onOpen(ws);
    },
    close: (ws) => hub.onClose(ws),
    pong: (ws) => {
      ws.data.alive = true;
    },
    // Client→server frames are not part of the contract; ignore them.
    message: () => {},
  };
}

/**
 * GET /watch/:dispute — hono upgrade route. `getServer` supplies the owning
 * Bun.serve instance via closure (main.ts binds it after listen).
 */
export function watchRoutes(
  hub: WatchHub,
  getServer: () => Bun.Server<WatchSocketData> | undefined,
  authorize?: (dispute: string, token: string | undefined) => Promise<boolean>,
): Hono {
  const app = new Hono();

  app.get("/watch/:dispute", async (c) => {
    const dispute = c.req.param("dispute");
    if (!ADDRESS.test(dispute)) {
      return Response.json({ error: "invalid dispute" }, { status: 400 });
    }
    if (authorize !== undefined && !(await authorize(dispute, c.req.query("token")))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const server = getServer();
    if (server === undefined) {
      return Response.json({ error: "watch not enabled" }, { status: 404 });
    }
    const ip = server.requestIP(c.req.raw)?.address ?? "unknown";
    if (!hub.reserveIp(ip)) {
      return Response.json({ error: "too many watch connections" }, { status: 429 });
    }
    const upgraded = server.upgrade(c.req.raw, { data: { dispute, ip, alive: false } });
    if (!upgraded) {
      // ponytail: a reserved-but-never-opened slot can leak only if the WS
      // handshake dies mid-upgrade; Bun still fires close for those sockets.
      hub.releaseIp(ip);
      return new Response("upgrade failed", { status: 426 });
    }
    return new Response(null);
  });

  return app;
}
