/**
 * trace sink tests (bean accord-9pdg, ADR-0037): the RemoteTraceSink POSTs
 * signed batches to the evidence daemon and structurally cannot fail a duty
 * — emit is sync and never throws, pushes are fire-and-forget with timeout,
 * failures drop the batch (visible seq gaps, accepted). The no-URL sink is
 * a no-op. Sig = Ed25519(hot key) over sha256(canonical JSON), verified
 * here against an independent application of the HANDOFF §2 formula.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { canonicalJson } from "../agent/runner.ts";
import { verifyTraceBatchSig } from "@useaccord/sdk/evidence";
import { makeTraceSink, signTraceBatch, type TraceBatchBody, type TraceEvent } from "./sink.ts";

const SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const IDENT = {
  juror: "JurorTrace1HotKey1111111111111111111111111",
  subaccord: "SubaTrace1",
  dispute: "DispTrace1",
};

/** The HANDOFF §2 sig formula, applied independently of the sink. */
function expectedSig(batch: Omit<TraceBatchBody, "sig">, juror: string, dispute: string): string {
  const hash = createHash("sha256")
    .update(canonicalJson({ v: batch.v, juror, dispute, seq: batch.seq, events: batch.events }))
    .digest();
  return Buffer.from(ed25519.sign(hash, SEED)).toString("base64");
}

interface Captured {
  path: string;
  body: TraceBatchBody;
}

const servers: Array<() => Promise<void>> = [];
afterAll(async () => {
  await Promise.all(servers.map((stop) => stop()));
});

/** Start + register for teardown a capture server. */
function captureServer(): { url: string; posts: Captured[] } {
  const posts: Captured[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const body = (await request.json()) as TraceBatchBody;
      posts.push({ path: new URL(request.url).pathname, body });
      return Response.json({ ok: true }, { status: 201 });
    },
  });
  servers.push(async () => server.stop(true));
  return { url: `http://localhost:${server.port}`, posts };
}

function sink(url: string | undefined, mode: "sealed" | "open" = "sealed") {
  return makeTraceSink({
    url,
    mode,
    juror: IDENT.juror,
    subaccord: IDENT.subaccord,
    dispute: IDENT.dispute,
    seed: SEED,
  });
}

describe("trace sink — batching + signing", () => {
  it("coalesces emits into one signed POST on the dispute route", async () => {
    const server = captureServer();
    const s = sink(server.url);
    const events: TraceEvent[] = [
      { kind: "duty-open", round: 0, seat: 2, reviewEnd: 1, commitEnd: 2, revealEnd: 3 },
      {
        kind: "verdict",
        optionIndex: 1,
        rationale: "sealed reasoning",
        confidence: 0.8,
        unsealAt: 9_998,
      },
      { kind: "commit", dryRun: true },
    ];
    for (const event of events) s.emit(event);
    await s.drain();

    expect(server.posts.length).toBe(1);
    expect(server.posts[0].path).toBe(`/trace/${IDENT.subaccord}/${IDENT.dispute}/${IDENT.juror}`);
    const post = server.posts[0].body;
    expect(post.v).toBe(1);
    expect(post.seq).toBe(1);
    expect(post.events).toEqual(events); // sealed mode keeps unsealAt
    expect(post.sig).toBe(
      expectedSig({ v: post.v, seq: post.seq, events: post.events }, IDENT.juror, IDENT.dispute),
    );
  });

  it("chunks at 64 events per POST and keeps seq monotonic (first-event seq)", async () => {
    const server = captureServer();
    const s = sink(server.url);
    for (let i = 0; i < 65; i++) s.emit({ kind: "commit", dryRun: true, tx: `sig${i}` });
    await s.drain();

    expect(server.posts.length).toBe(2);
    expect(server.posts[0].body.events.length).toBe(64);
    expect(server.posts[0].body.seq).toBe(1);
    expect(server.posts[1].body.events.length).toBe(1);
    expect(server.posts[1].body.seq).toBe(65);
    expect(server.posts[1].body.events[0]).toEqual({ kind: "commit", dryRun: true, tx: "sig64" });
  });

  it("open mode strips unsealAt from verdict frames (demo release-at-push)", async () => {
    const server = captureServer();
    const s = sink(server.url, "open");
    s.emit({ kind: "verdict", optionIndex: 0, rationale: "r", confidence: 0.5, unsealAt: 9_998 });
    await s.drain();

    const verdict = server.posts[0].body.events[0];
    expect(verdict.kind).toBe("verdict");
    expect("unsealAt" in verdict).toBe(false);
  });

  it("queue bound 256 drops the OLDEST events (seq gaps visible, accepted)", async () => {
    // All 300 pushes are synchronous — the cap trims during the loop, before
    // any macrotask flush can drain, so the outcome is deterministic.
    const server = captureServer();
    const s = sink(server.url);
    for (let i = 1; i <= 300; i++) {
      s.emit({ kind: "evidence", files: [{ path: `f${i}`, sha256: "ab", bytes: i }] });
    }
    await s.drain();

    const received = server.posts.flatMap((p) => p.body.events);
    expect(received.length).toBe(256); // 300 pushed, cap 256
    expect(received[0]).toEqual({
      kind: "evidence",
      files: [{ path: "f45", sha256: "ab", bytes: 45 }],
    });
    expect(received.at(-1)).toEqual({
      kind: "evidence",
      files: [{ path: "f300", sha256: "ab", bytes: 300 }],
    });
  });
});

describe("trace sink — failure contract (never throw, never stall)", () => {
  it("dead endpoint: emit + drain resolve, nothing throws", async () => {
    const s = sink("http://127.0.0.1:1");
    s.emit({ kind: "commit", dryRun: true });
    await s.drain(); // refused connection → batch dropped silently
  });

  it("hung endpoint: push aborts at the timeout, duty path unaffected", async () => {
    const never = Bun.serve({
      port: 0,
      fetch: () => Promise.withResolvers<Response>().promise, // never responds
    });
    servers.push(async () => never.stop(true));
    const s = makeTraceSink({
      url: `http://localhost:${never.port}`,
      mode: "sealed",
      juror: IDENT.juror,
      subaccord: IDENT.subaccord,
      dispute: IDENT.dispute,
      seed: SEED,
      pushTimeoutMs: 50,
    });
    s.emit({ kind: "reveal", tx: "sig" });
    await s.drain(); // resolves once the timeout aborts the push
  });

  it("unset URL is a no-op sink", async () => {
    const s = sink(undefined);
    s.emit({ kind: "abstain", failure: "window-closed", reason: "no verdict" });
    await s.drain();
  });
});

describe("signTraceBatch — deterministic over canonical JSON", () => {
  const payload = {
    v: 1 as const,
    seq: 7,
    events: [{ kind: "commit", dryRun: true } as TraceEvent, { kind: "reveal", tx: "s" }],
  };

  it("same payload → same sig; key insertion order is irrelevant", () => {
    const a = signTraceBatch(payload, IDENT, SEED);
    const b = signTraceBatch({ seq: 7, events: payload.events, v: 1 }, IDENT, SEED);
    expect(a).toBe(b);
  });

  it("different identity or payload → different sig", () => {
    const base = signTraceBatch(payload, IDENT, SEED);
    expect(signTraceBatch(payload, { ...IDENT, dispute: "DispOther" }, SEED)).not.toBe(base);
    expect(signTraceBatch({ ...payload, seq: 8 }, IDENT, SEED)).not.toBe(base);
  });
  it("sig verifies with the daemon-side verifier (SDK wire contract, ADR-0037)", () => {
    // The daemon decodes `sig` as BASE64 and verifies with the shared SDK
    // helper — the exact code path of POST /trace ingest. Pins the encoding:
    // hex sigs decode to garbage and 403 every push (found in prod).
    const sig = signTraceBatch(payload, IDENT, SEED);
    expect(
      verifyTraceBatchSig(
        ed25519.getPublicKey(SEED),
        {
          v: payload.v,
          juror: IDENT.juror,
          dispute: IDENT.dispute,
          seq: payload.seq,
          events: payload.events,
        },
        Buffer.from(sig, "base64"),
      ),
    ).toBe(true);
  });

  it("sig verifies against the hot-key public key", () => {
    const sig = signTraceBatch(payload, IDENT, SEED);
    const hash = createHash("sha256")
      .update(
        canonicalJson({
          v: payload.v,
          juror: IDENT.juror,
          dispute: IDENT.dispute,
          seq: payload.seq,
          events: payload.events,
        }),
      )
      .digest();
    expect(ed25519.verify(Buffer.from(sig, "base64"), hash, ed25519.getPublicKey(SEED))).toBe(true);
  });
});
