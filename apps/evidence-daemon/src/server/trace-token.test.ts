/**
 * POST /trace-token/{dispute} contract (ADR-0037 read gate): happy mint,
 * wrong filer 403, stale ts 401, malformed inputs 400, unknown dispute 404,
 * TTL expiry via injected clock. Real Ed25519 keypairs — the default
 * verifier runs end-to-end.
 */
import { describe, expect, it } from "bun:test";
import { address, type Address } from "@solana/kit";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

import type { DisputeView } from "../chain/reader.js";
import { TraceTokenService, traceTokenRoutes } from "./trace-token.js";

const DISPUTE: Address = address("11111111111111111111111111111111");

const FILER_SEED = new Uint8Array(32).fill(3);
const FILER_PUB = ed25519.getPublicKey(FILER_SEED);
const FILER = address(bs58.encode(FILER_PUB));
const OTHER_SEED = new Uint8Array(32).fill(4);
const OTHER = address(bs58.encode(ed25519.getPublicKey(OTHER_SEED)));

const NOW_MS = 1_700_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

function disputeView(filer: Address): DisputeView {
  // Only `filer` is load-bearing here; the view is opaque to the route.
  return {
    subaccord: DISPUTE,
    filer,
    evidenceHashes: [],
    state: 4,
    currentRound: 0,
  } as DisputeView;
}

function app(
  readDispute: (d: Address) => Promise<DisputeView | null>,
  tokens = new TraceTokenService(),
) {
  return traceTokenRoutes({
    tokens,
    readDispute,
    now: () => NOW_MS,
  });
}

function signed(seed: Uint8Array, dispute = DISPUTE, filer = FILER, ts = NOW_S): string {
  const msg = new TextEncoder().encode(`trace-read:${dispute}:${filer}:${ts}`);
  return Buffer.from(ed25519.sign(msg, seed)).toString("hex");
}

function post(body: unknown, dispute: Address | string = DISPUTE): Request {
  return new Request(`https://x/trace-token/${dispute}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /trace-token/:dispute", () => {
  it("mints for the filer with a fresh valid signature", async () => {
    const tokens = new TraceTokenService(() => NOW_MS);
    const res = await app(async () => disputeView(FILER), tokens).request(
      post({ filer: FILER, ts: NOW_S, sig: signed(FILER_SEED) }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.expiresAt).toBe(NOW_MS + 5 * 60_000);
    expect(tokens.verify(DISPUTE, body.token)).toBe(true);
  });

  it("403 when the requester is not the on-chain filer", async () => {
    const res = await app(async () => disputeView(OTHER)).request(
      post({ filer: FILER, ts: NOW_S, sig: signed(FILER_SEED) }),
    );
    expect(res.status).toBe(403);
  });

  it("401 on a stale ts (outside the ±300s window)", async () => {
    const res = await app(async () => disputeView(FILER)).request(
      post({ filer: FILER, ts: NOW_S - 301, sig: signed(FILER_SEED, DISPUTE, FILER, NOW_S - 301) }),
    );
    expect(res.status).toBe(401);
  });

  it("400 on malformed dispute / filer / ts / sig / body", async () => {
    const a = app(async () => disputeView(FILER));
    expect(
      (await a.request(post({ filer: FILER, ts: NOW_S, sig: signed(FILER_SEED) }, "not!"))).status,
    ).toBe(400);
    expect(
      (await a.request(post({ filer: "nope", ts: NOW_S, sig: signed(FILER_SEED) }))).status,
    ).toBe(400);
    expect((await a.request(post({ filer: FILER, ts: "x", sig: signed(FILER_SEED) }))).status).toBe(
      400,
    );
    expect((await a.request(post({ filer: FILER, ts: NOW_S, sig: "zz" }))).status).toBe(400);
    expect(
      (
        await a.request(
          new Request("https://x/trace-token/11111111111111111111111111111111", {
            method: "POST",
            body: "not json",
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("404 on an unknown dispute", async () => {
    const res = await app(async () => null).request(
      post({ filer: FILER, ts: NOW_S, sig: signed(FILER_SEED) }),
    );
    expect(res.status).toBe(404);
  });

  it("401 on a bad signature (right filer, wrong key)", async () => {
    const res = await app(async () => disputeView(FILER)).request(
      post({ filer: FILER, ts: NOW_S, sig: signed(OTHER_SEED) }),
    );
    expect(res.status).toBe(401);
  });

  it("minted token stops verifying after the TTL", async () => {
    let now = NOW_MS;
    const tokens = new TraceTokenService(() => now);
    const { token } = tokens.mint(DISPUTE);
    expect(tokens.verify(DISPUTE, token)).toBe(true);
    now += 5 * 60_000 + 1;
    expect(tokens.verify(DISPUTE, token)).toBe(false);
  });
});
