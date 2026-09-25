// delivery-key.test.ts — juror Delivery Key protocol self-check (ADR-0034).
//
// Pins the registration contract shared with the daemon (message builder +
// signature verifier round-trip, malformed-input rejection), the keygen/
// codec/storage invariants (32-byte X25519, generate-once), and the HTTP
// choreography (register PUT body, GET, multi-origin self-heal, fetchDelivery
// decode) against a stubbed fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getBase58Decoder } from "@solana/kit";

import { ed25519, x25519 } from "@noble/curves/ed25519";
import {
  buildDeliveryKeyMessage,
  decodeDeliveryKeypair,
  DELKEY_PREFIX,
  encodeDeliveryKeypair,
  ensureRegisteredDeliveryKey,
  fetchDelivery,
  generateDeliveryKey,
  getRegisteredDeliveryKey,
  loadOrCreateDeliveryKey,
  registerDeliveryKey,
  verifyDeliveryKeyRegistration,
} from "./index.ts";
import { fromBase64, toBase64 } from "./base64.js";

const rnd32 = () => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
};
const edPair = () => {
  const sk = rnd32();
  return { sk, pk: ed25519.getPublicKey(sk) };
};

// ---------------------------------------------------------------------------
// Keygen + persistence codec
// ---------------------------------------------------------------------------

test("generateDeliveryKey produces a 32-byte X25519 pair (pub derives from secret)", () => {
  const kp = generateDeliveryKey();
  assert.equal(kp.publicKey.length, 32);
  assert.equal(kp.secretKey.length, 32);
  assert.deepEqual(kp.publicKey, x25519.getPublicKey(kp.secretKey));
});
test("loadOrCreateDeliveryKey is generate-once: second load returns the stored key", async () => {
  const stored: Uint8Array[] = [];
  const storage = {
    async get() {
      return stored.length === 0 ? null : stored[0]!;
    },
    async set(b: Uint8Array) {
      stored.push(b);
    },
  };
  const a = await loadOrCreateDeliveryKey(storage);
  const b = await loadOrCreateDeliveryKey(storage);
  assert.deepEqual(encodeDeliveryKeypair(a), encodeDeliveryKeypair(b));
  assert.equal(stored.length, 1);
});

// ---------------------------------------------------------------------------
// Registration message + signature verification
// ---------------------------------------------------------------------------

test("buildDeliveryKeyMessage matches the ADR-0034 wire format byte-for-byte", () => {
  const encPub = generateDeliveryKey().publicKey;
  const b58 = getBase58Decoder().decode(encPub);
  const expected = `${DELKEY_PREFIX}\nregistered_at:1234567\nenc_pub:${b58}`;
  assert.deepEqual(
    buildDeliveryKeyMessage(encPub, 1234567),
    new TextEncoder().encode(expected),
  );
  // deterministic
  assert.deepEqual(
    buildDeliveryKeyMessage(encPub, 1234567),
    buildDeliveryKeyMessage(encPub, 1234567),
  );
});

test("buildDeliveryKeyMessage rejects malformed inputs", () => {
  assert.throws(() => buildDeliveryKeyMessage(new Uint8Array(31), 1));
  assert.throws(() => buildDeliveryKeyMessage(generateDeliveryKey().publicKey, -1));
  assert.throws(() => buildDeliveryKeyMessage(generateDeliveryKey().publicKey, 1.5));
});

test("verifyDeliveryKeyRegistration: wallet-signed message verifies; every mutation fails", () => {
  const juror = edPair();
  const encPub = generateDeliveryKey().publicKey;
  const registeredAt = 1_700_000_000_000;
  const sig = ed25519.sign(buildDeliveryKeyMessage(encPub, registeredAt), juror.sk);

  assert.equal(
    verifyDeliveryKeyRegistration(juror.pk, encPub, registeredAt, sig),
    true,
  );
  // different wallet
  const stranger = edPair();
  assert.equal(
    verifyDeliveryKeyRegistration(stranger.pk, encPub, registeredAt, sig),
    false,
  );
  // replay-downgrade: tampered registered_at
  assert.equal(
    verifyDeliveryKeyRegistration(juror.pk, encPub, registeredAt - 1, sig),
    false,
  );
  // different enc_pub (key swap)
  assert.equal(
    verifyDeliveryKeyRegistration(juror.pk, generateDeliveryKey().publicKey, registeredAt, sig),
    false,
  );
  // malformed inputs → false (daemon maps to 400), never a throw
  assert.equal(verifyDeliveryKeyRegistration(juror.pk, new Uint8Array(31), registeredAt, sig), false);
  assert.equal(verifyDeliveryKeyRegistration(juror.pk, encPub, registeredAt, new Uint8Array(63)), false);
});

// ---------------------------------------------------------------------------
// HTTP choreography against a stubbed fetch
// ---------------------------------------------------------------------------

/** Route table stub: (method, url-suffix) → handler. */
type Route = { method: string; suffix: string; handle: (req: Request) => Response };

function stubFetch(routes: Route[]): { calls: Array<{ method: string; url: string; body: unknown }> } {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = req.url;
    const route = routes.find(
      (r) => r.method === req.method && url.includes(r.suffix),
    );
    calls.push({
      method: req.method,
      url,
      body: req.body === null ? null : await new Response(req.body).json(),
    });
    if (route === undefined) return new Response("no route", { status: 500 });
    return route.handle(req);
  }) as typeof fetch;
  test.finalizer?.(() => {
    globalThis.fetch = realFetch;
  });
  return { calls };
}

test("registerDeliveryKey PUTs a sig-valid body and returns the registration", async () => {
  const juror = edPair();
  const kp = generateDeliveryKey();
  let body: { enc_pub?: string; registered_at?: number; sig?: string } | undefined;
  const { calls } = stubFetch([
    {
      method: "PUT",
      suffix: "/jurors/",
      handle: () => new Response(null, { status: 201 }),
    },
  ]);
  const realSign = async (msg: Uint8Array) => ed25519.sign(msg, juror.sk);

  const out = await registerDeliveryKey({
    endpoint: "http://daemon",
    juror: "JurorAddr",
    encPub: kp.publicKey,
    signMessage: realSign,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/jurors\/JurorAddr\/delivery-key$/);
  body = calls[0]!.body as typeof body;
  assert.deepEqual(fromBase64(body.enc_pub!), kp.publicKey);
  assert.equal(typeof body.registered_at, "number");
  assert.equal(out.registeredAt, body.registered_at!);
  // daemon-shared verifier accepts the exact wire body
  assert.equal(
    verifyDeliveryKeyRegistration(
      juror.pk,
      fromBase64(body.enc_pub!),
      body.registered_at!,
      fromBase64(body.sig!),
    ),
    true,
  );
});

test("registerDeliveryKey surfaces daemon rejections (409 stale)", async () => {
  stubFetch([
    {
      method: "PUT",
      suffix: "/jurors/",
      handle: () => new Response(JSON.stringify({ error: "stale registered_at" }), { status: 409 }),
    },
  ]);
  await assert.rejects(
    () =>
      registerDeliveryKey({
        endpoint: "http://daemon",
        juror: "J",
        encPub: generateDeliveryKey().publicKey,
        signMessage: async () => new Uint8Array(64),
      }),
    /409/,
  );
});

test("getRegisteredDeliveryKey: 200 decodes, 404 → null, malformed → throw", async () => {
  const kp = generateDeliveryKey();
  stubFetch([
    {
      method: "GET",
      suffix: "/jurors/J/delivery-key",
      handle: () =>
        new Response(
          JSON.stringify({ enc_pub: toBase64(kp.publicKey), registered_at: 42 }),
          { status: 200 },
        ),
    },
  ]);
  const got = await getRegisteredDeliveryKey({ endpoint: "http://daemon", juror: "J" });
  assert.deepEqual(got?.encPub, kp.publicKey);
  assert.equal(got?.registeredAt, 42);

  stubFetch([
    {
      method: "GET",
      suffix: "/jurors/J/delivery-key",
      handle: () => new Response(null, { status: 404 }),
    },
  ]);
  assert.equal(
    await getRegisteredDeliveryKey({ endpoint: "http://daemon", juror: "J" }),
    null,
  );

  stubFetch([
    {
      method: "GET",
      suffix: "/jurors/J/delivery-key",
      handle: () => new Response(JSON.stringify({ nope: 1 }), { status: 200 }),
    },
  ]);
  await assert.rejects(() =>
    getRegisteredDeliveryKey({ endpoint: "http://daemon", juror: "J" }),
  );
});

test("ensureRegisteredDeliveryKey self-heal: match → current (no PUT); mismatch/absent → re-registered", async () => {
  const juror = edPair();
  const local = generateDeliveryKey();
  const other = generateDeliveryKey();

  // registered == local → "current", no PUT issued
  let putSeen = 0;
  stubFetch([
    {
      method: "GET",
      suffix: "/jurors/J/delivery-key",
      handle: () =>
        new Response(
          JSON.stringify({ enc_pub: toBase64(local.publicKey), registered_at: 1 }),
          { status: 200 },
        ),
    },
    {
      method: "PUT",
      suffix: "/jurors/J/delivery-key",
      handle: () => {
        putSeen++;
        return new Response(null, { status: 201 });
      },
    },
  ]);
  const sign = async (msg: Uint8Array) => ed25519.sign(msg, juror.sk);
  assert.equal(
    await ensureRegisteredDeliveryKey({ endpoint: "http://daemon", juror: "J", encPub: local.publicKey, signMessage: sign }),
    "current",
  );
  assert.equal(putSeen, 0);

  // another origin rotated → mismatch → one PUT (re-register)
  assert.equal(
    await ensureRegisteredDeliveryKey({ endpoint: "http://daemon", juror: "J", encPub: other.publicKey, signMessage: sign }),
    "re-registered",
  );
  assert.equal(putSeen, 1);
});

test("fetchDelivery decodes the wire rounds; 404 → null; non-2xx → throw", async () => {
  const kp = generateDeliveryKey();
  const wire = {
    rounds: [
      {
        round: 0,
        out: toBase64(new Uint8Array([1, 2, 3])),
        operator_ephem_pub: toBase64(kp.publicKey),
        files: [{ path: "a.pdf", status: "stored" }],
        complete: true,
      },
    ],
  };
  stubFetch([
    {
      method: "GET",
      suffix: "/for/J",
      handle: () => new Response(JSON.stringify(wire), { status: 200 }),
    },
  ]);
  const rounds = await fetchDelivery({ endpoint: "http://daemon", dispute: "D", juror: "J" });
  assert.equal(rounds!.length, 1);
  assert.deepEqual(rounds![0]!.out, new Uint8Array([1, 2, 3]));
  assert.deepEqual(rounds![0]!.operator_ephem_pub, kp.publicKey);
  assert.deepEqual(rounds![0]!.files, [{ path: "a.pdf", status: "stored" }]);

  stubFetch([
    {
      method: "GET",
      suffix: "/for/J",
      handle: () => new Response(null, { status: 404 }),
    },
  ]);
  assert.equal(
    await fetchDelivery({ endpoint: "http://daemon", dispute: "D", juror: "J" }),
    null,
  );

  stubFetch([
    {
      method: "GET",
      suffix: "/for/J",
      handle: () => new Response("boom", { status: 500 }),
    },
  ]);
  await assert.rejects(() =>
    fetchDelivery({ endpoint: "http://daemon", dispute: "D", juror: "J" }),
  );
});
