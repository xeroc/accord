// wire.test.ts — composition-layer integration (bean accord-tzmm).
//
// Drives createServerDeps end-to-end with REAL ECIES crypto + EnvKeyring, an
// in-memory EvidenceStore, and a stubbed `Accord` RPC (controlled on-chain
// views). This is the proof the wiring is correct without a live S3/RPC:
//
//   claimant-encrypt → POST (ingest handler) → store →
//   GET (deliver handler) → decrypt/re-encrypt → juror-decrypt → verify hash.
//
// It also pins the 404/409 edge contracts the HTTP layer depends on.
import { test, expect } from "bun:test";
import { address, type Address } from "@solana/kit";
import bs58 from "bs58";
import { DisputeState } from "@useaccord/sdk";

import {
  buildDeliveryKeyMessage,
  claimantEncrypt,
  ed25519PublicKeyFromSeed,
  generateDeliveryKey,
  jurorDecryptDelivery,
  sha256,
} from "@useaccord/sdk/evidence";
import { ed25519 } from "@noble/curves/ed25519";
import type { DeliveryKeyStore, JurorDeliveryKey } from "../src/store/delivery-key";

import { EnvKeyring } from "../src/keys/keyring";
import {
  bytesToBase64,
  base64ToBytes,
  type EvidenceBundle,
  type EvidenceStore,
} from "../src/store/store";
import { type DomainStore } from "../src/store/domain";
import { createServerDeps } from "../src/wire";
import { stubAccord } from "./helpers/accordStub.ts";
import type { KeyringPublicKeys } from "../src/server/public-keys";
const operatorSeed = crypto.getRandomValues(new Uint8Array(32));
const operatorPub = ed25519PublicKeyFromSeed(operatorSeed);
const jurorSeed = crypto.getRandomValues(new Uint8Array(32));
const jurorPub = ed25519PublicKeyFromSeed(jurorSeed);
/** The juror's registered Delivery Key (ADR-0034). */
const jurorDelivery = generateDeliveryKey();

// Path addresses (arbitrary valid base58; the system-program id = 32 zero bytes).
const SUB: Address = address("11111111111111111111111111111111");
const DISPUTE: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const PLAINTEXT = new TextEncoder().encode("top-secret evidence payload");

// Minimal public-keys snapshot — wire tests don't assert its values; it only
// satisfies the required ServerDeps.publicKeys field threaded through createServerDeps.
const publicKeys: KeyringPublicKeys = {
  operators: [{ base58: bs58.encode(operatorPub), hex: Buffer.from(operatorPub).toString("hex") }],
};

/** In-memory EvidenceStore stand-in (exercises the bundle-shape adapter). */
function memoryStore(): EvidenceStore & { size: () => number } {
  const objects = new Map<string, EvidenceBundle>();
  const key = (sa: Address, d: Address, r: number) => `${sa}/${d}/${r}`;
  return {
    size: () => objects.size,
    async put(b) {
      objects.set(key(b.subaccord, b.dispute, b.round), b);
    },
    async get(sa, d, r) {
      return objects.get(key(sa, d, r)) ?? null;
    },
    async delete(sa, d, r) {
      objects.delete(key(sa, d, r));
    },
    async exists(sa, d, r) {
      return objects.has(key(sa, d, r));
    },
    async putFile(b, path) {
      objects.set(`${key(b.subaccord, b.dispute, b.round)}::${path}`, b);
    },
    async getFile(sa, d, r, path) {
      return objects.get(`${key(sa, d, r)}::${path}`) ?? null;
    },
    async listFiles(sa, d, r) {
      const p = `${key(sa, d, r)}::`;
      return [...objects.keys()]
        .filter((k) => k.startsWith(p))
        .map((k) => ({ path: k.slice(p.length), bytes: objects.get(k)!.ct.length }))
        .sort((a, b) => (a.path < b.path ? -1 : 1));
    },
  };
}

/** In-memory DomainStore stand-in (wire tests don't exercise domain routes). */
function memoryDomainStore(): DomainStore {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    async put(o) {
      objects.set(o.hash, { bytes: o.bytes, contentType: o.contentType });
    },
    async get(hash) {
      const o = objects.get(hash);
      return o === undefined ? null : { hash, bytes: o.bytes, contentType: o.contentType };
    },
    async exists(hash) {
      return objects.has(hash);
    },
  };
}
/** In-memory DeliveryKeyStore stand-in (ADR-0034). */
function memoryDeliveryKeyStore(): DeliveryKeyStore {
  const byJuror = new Map<string, JurorDeliveryKey>();
  return {
    async put(k) {
      byJuror.set(k.juror, k);
    },
    async get(juror) {
      return byJuror.get(juror) ?? null;
    },
  };
}

/** Sign + PUT a registration for the drawn juror through the real handler. */
async function registerJurorDeliveryKey(deps: {
  deliveryKeyPut: (juror: string, body: unknown) => Promise<{ ok: boolean }>;
}): Promise<void> {
  const registeredAt = Date.now();
  const sig = ed25519.sign(
    buildDeliveryKeyMessage(jurorDelivery.publicKey, registeredAt),
    jurorSeed,
  );
  const res = await deps.deliveryKeyPut(bs58.encode(jurorPub), {
    enc_pub: bytesToBase64(jurorDelivery.publicKey),
    registered_at: registeredAt,
    sig: bytesToBase64(sig),
  });
  expect(res.ok).toBe(true);
}

async function rig(registerDeliveryKey = true) {
  const evidenceHash = await sha256(PLAINTEXT);
  const accord = await stubAccord({
    subaccord: {
      address: SUB,
      data: {
        evidenceOperator: address(bs58.encode(operatorPub)),
        evidenceSpec: new Uint8Array(32),
      },
    },
    dispute: {
      address: DISPUTE,
      data: {
        subaccord: SUB,
        evidenceHashes: [evidenceHash, new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
        state: DisputeState.Drawn,
        currentRound: 0,
      },
    },
    round: {
      dispute: DISPUTE,
      roundIdx: 0,
      data: { roundIdx: 0, jurorCount: 1, jurors: [address(bs58.encode(jurorPub))] },
    },
  });
  const keyring = EnvKeyring.fromEnv(bs58.encode(operatorSeed));
  const store = memoryStore();
  const deps = createServerDeps({
    store,
    accord,
    domainStore: memoryDomainStore(),
    deliveryKeyStore: memoryDeliveryKeyStore(),
    maxDomainBytes: 1_048_576,
    maxEntries: 64,
    maxDocBytes: 10_485_760,
    maxPackageBytes: 104_857_600,
    keyring,
    health: async () => ({ ok: true }),
    publicKeys,
  });
  if (registerDeliveryKey) await registerJurorDeliveryKey(deps);
  return { deps, store, evidenceHash, accord };
}

/** Build a valid POST body (base64 fields) from a real claimant encryption. */
async function postBody() {
  const bundle = await claimantEncrypt(PLAINTEXT, operatorPub);
  return {
    ct: bytesToBase64(bundle.ct),
    claimant_ephem_pub: bytesToBase64(bundle.claimant_ephem_pub),
    wrapped: bytesToBase64(bundle.wrapped),
    plaintext_hash: bytesToBase64(bundle.plaintext_hash),
  };
}

test("wire: ingest + deliver round-trip — juror decrypts to the original plaintext", async () => {
  const { deps, store } = await rig();
  const body = await postBody();

  const ingested = await deps.ingest(SUB, DISPUTE, 0, body);
  expect(ingested.ok).toBe(true);
  if (!ingested.ok) throw new Error("unreachable");
  expect(ingested.status).toBe(201);
  expect(ingested.location).toBe(`/evidence/${SUB}/${DISPUTE}/0`);
  expect(store.size()).toBe(1); // ciphertext object persisted, plaintext never

  const delivered = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  expect(delivered.ok).toBe(true);
  if (!delivered.ok) throw new Error("unreachable");
  // Juror decrypts with its registered Delivery Key secret — recovers exactly
  // the claimant's plaintext (ADR-0034 strict delivery; the rig registers
  // jurorDelivery for the drawn juror before delivering).
  const recovered = await jurorDecryptDelivery(
    {
      out: base64ToBytes(delivered.body.rounds[0]!.out),
      operator_ephem_pub: base64ToBytes(delivered.body.rounds[0]!.operator_ephem_pub),
    },
    jurorDelivery.secretKey,
  );
  expect(recovered).toEqual(PLAINTEXT);
});

test("wire: re-POST of the same plaintext_hash is idempotent (single object)", async () => {
  const { deps, store } = await rig();
  const body = await postBody();
  const first = await deps.ingest(SUB, DISPUTE, 0, body);
  const second = await deps.ingest(SUB, DISPUTE, 0, body);
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(store.size()).toBe(1);
});

test("wire: deliver by a non-drawn juror → 404", async () => {
  const { deps } = await rig();
  await deps.ingest(SUB, DISPUTE, 0, await postBody());
  const other = ed25519PublicKeyFromSeed(crypto.getRandomValues(new Uint8Array(32)));
  const res = await deps.deliver(DISPUTE, bs58.encode(other));
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
});

test("wire: deliver before ingest (no bundle) → 404", async () => {
  const { deps } = await rig();
  const res = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
});

test("wire: ingest against a missing on-chain dispute → 404", async () => {
  const store = memoryStore();
  const keyring = EnvKeyring.fromEnv(bs58.encode(operatorSeed));
  const accord = await stubAccord({});
  const deps = createServerDeps({
    store,
    accord,
    domainStore: memoryDomainStore(),
    deliveryKeyStore: memoryDeliveryKeyStore(),
    maxDomainBytes: 1_048_576,
    maxEntries: 64,
    maxDocBytes: 10_485_760,
    maxPackageBytes: 104_857_600,
    keyring,
    health: async () => ({ ok: true }),
    publicKeys,
  });
  const res = await deps.ingest(SUB, DISPUTE, 0, await postBody());
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
});

test("wire: malformed POST body (missing fields) → 400", async () => {
  const { deps } = await rig();
  const res = await deps.ingest(SUB, DISPUTE, 0, { ct: "not-enough" });
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(400);
});

test("wire: a different Delivery Key secret cannot decrypt the delivered bundle", async () => {
  const { deps } = await rig();
  await deps.ingest(SUB, DISPUTE, 0, await postBody());
  const delivered = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  if (!delivered.ok) throw new Error("unreachable");
  // Any key but the registered one fails the AES-GCM auth tag.
  await expect(
    jurorDecryptDelivery(
      {
        out: base64ToBytes(delivered.body.rounds[0]!.out),
        operator_ephem_pub: base64ToBytes(delivered.body.rounds[0]!.operator_ephem_pub),
      },
      generateDeliveryKey().secretKey,
    ),
  ).rejects.toThrow();
});

// --- manifest (decrypted public read) ---------------------------------------

test("wire: manifest decrypts the stored bundle and returns the plaintext", async () => {
  const { deps } = await rig();
  await deps.ingest(SUB, DISPUTE, 0, await postBody());

  const res = await deps.manifest(SUB, DISPUTE, 0);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("unreachable");
  expect(res.status).toBe(200);
  // PLAINTEXT is a UTF-8 string that is not valid JSON → returned as raw string.
  expect(res.body).toBe(new TextDecoder().decode(PLAINTEXT));
});

test("wire: manifest before ingest (no bundle) → 404", async () => {
  const { deps } = await rig();
  const res = await deps.manifest(SUB, DISPUTE, 0);
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
});

test("wire: multifile — POST manifest with entries, PUT document (real ECIES)", async () => {
  const enc = new TextEncoder();
  const DOC = enc.encode("police report pdf bytes");
  const leafHex = Array.from(await sha256(DOC))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const manifest = enc.encode(
    [
      "schema: riprap-claim/v1",
      'title: "claim"',
      "entries:",
      `  - { path: "03-police-report.pdf", sha256: "${leafHex}" }`,
    ].join("\n") + "\n",
  );
  const manifestHash = await sha256(manifest);

  const accord = await stubAccord({
    subaccord: {
      address: SUB,
      data: {
        evidenceOperator: address(bs58.encode(operatorPub)),
        evidenceSpec: new Uint8Array(32),
      },
    },
    dispute: {
      address: DISPUTE,
      data: {
        subaccord: SUB,
        evidenceHashes: [manifestHash, new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
        state: DisputeState.Drawn,
        currentRound: 0,
      },
    },
  });
  const deps = createServerDeps({
    store: memoryStore(),
    accord,
    domainStore: memoryDomainStore(),
    deliveryKeyStore: memoryDeliveryKeyStore(),
    maxDomainBytes: 1_048_576,
    maxEntries: 64,
    maxDocBytes: 10_485_760,
    maxPackageBytes: 104_857_600,
    keyring: EnvKeyring.fromEnv(bs58.encode(operatorSeed)),
    health: async () => ({ ok: true }),
    publicKeys,
  });

  const mBody = await claimantEncrypt(manifest, operatorPub);
  const post = await deps.ingest(SUB, DISPUTE, 0, {
    ct: bytesToBase64(mBody.ct),
    claimant_ephem_pub: bytesToBase64(mBody.claimant_ephem_pub),
    wrapped: bytesToBase64(mBody.wrapped),
    plaintext_hash: bytesToBase64(mBody.plaintext_hash),
  });
  expect(post.ok).toBe(true);

  const dBody = await claimantEncrypt(DOC, operatorPub);
  const put = await deps.ingestFile(SUB, DISPUTE, 0, "03-police-report.pdf", {
    ct: bytesToBase64(dBody.ct),
    claimant_ephem_pub: bytesToBase64(dBody.claimant_ephem_pub),
    wrapped: bytesToBase64(dBody.wrapped),
    plaintext_hash: bytesToBase64(dBody.plaintext_hash),
  });
  expect(put.ok).toBe(true);
  if (!put.ok) throw new Error("unreachable");
  expect(put.idempotent).toBe(false);

  // wrong-leaf document never lands
  const wrong = await claimantEncrypt(enc.encode("forged bytes"), operatorPub);
  const put2 = await deps.ingestFile(SUB, DISPUTE, 0, "03-police-report.pdf", {
    ct: bytesToBase64(wrong.ct),
    claimant_ephem_pub: bytesToBase64(wrong.claimant_ephem_pub),
    wrapped: bytesToBase64(wrong.wrapped),
    plaintext_hash: bytesToBase64(wrong.plaintext_hash),
  });
  expect(put2.ok).toBe(false);
});

// --- Delivery Key registration + strict delivery (ADR-0034) -----------------

test("delivery-key: register happy → 201; GET returns the registered key", async () => {
  const { deps } = await rig();
  const got = await deps.deliveryKeyGet(bs58.encode(jurorPub));
  expect(got.ok).toBe(true);
  if (!got.ok) throw new Error("unreachable");
  expect(base64ToBytes(got.body.enc_pub)).toEqual(jurorDelivery.publicKey);
  expect(typeof got.body.registered_at).toBe("number");
});

test("delivery-key: GET before any registration → 404", async () => {
  const { deps } = await rig(false);
  const got = await deps.deliveryKeyGet(bs58.encode(jurorPub));
  expect(got.ok).toBe(false);
  if (got.ok) throw new Error("unreachable");
  expect(got.status).toBe(404);
});

test("delivery-key: signature by a different wallet → 400", async () => {
  const { deps } = await rig(false);
  const registeredAt = Date.now();
  const sig = ed25519.sign(
    buildDeliveryKeyMessage(jurorDelivery.publicKey, registeredAt),
    crypto.getRandomValues(new Uint8Array(32)),
  );
  const res = await deps.deliveryKeyPut(bs58.encode(jurorPub), {
    enc_pub: bytesToBase64(jurorDelivery.publicKey),
    registered_at: registeredAt,
    sig: bytesToBase64(sig),
  });
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(400);
});

test("delivery-key: stale registered_at (≤ stored) → 409; rotation with a later ts → 201", async () => {
  const { deps } = await rig();
  const stored = await deps.deliveryKeyGet(bs58.encode(jurorPub));
  if (!stored.ok) throw new Error("unreachable");

  // Replay at the SAME ts — even sig-valid — is refused (replay-downgrade).
  const sig = ed25519.sign(
    buildDeliveryKeyMessage(jurorDelivery.publicKey, stored.body.registered_at),
    jurorSeed,
  );
  const replay = await deps.deliveryKeyPut(bs58.encode(jurorPub), {
    enc_pub: bytesToBase64(jurorDelivery.publicKey),
    registered_at: stored.body.registered_at,
    sig: bytesToBase64(sig),
  });
  expect(replay.ok).toBe(false);
  if (replay.ok) throw new Error("unreachable");
  expect(replay.status).toBe(409);

  // Rotation (new key, later ts) succeeds and is what GET serves next.
  const rotated = generateDeliveryKey();
  const sig2 = ed25519.sign(
    buildDeliveryKeyMessage(rotated.publicKey, stored.body.registered_at + 1),
    jurorSeed,
  );
  const res2 = await deps.deliveryKeyPut(bs58.encode(jurorPub), {
    enc_pub: bytesToBase64(rotated.publicKey),
    registered_at: stored.body.registered_at + 1,
    sig: bytesToBase64(sig2),
  });
  expect(res2.ok).toBe(true);
  const after = await deps.deliveryKeyGet(bs58.encode(jurorPub));
  if (!after.ok) throw new Error("unreachable");
  expect(base64ToBytes(after.body.enc_pub)).toEqual(rotated.publicKey);
});

test("delivery-key: malformed body → 400", async () => {
  const { deps } = await rig(false);
  const res = await deps.deliveryKeyPut(bs58.encode(jurorPub), { enc_pub: "not-b64!!" });
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(400);
});

test("deliver: STRICT — drawn juror without a registered Delivery Key → 404 (ADR-0034)", async () => {
  const { deps } = await rig(false);
  await deps.ingest(SUB, DISPUTE, 0, await postBody());
  const res = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
  expect(res.error).toMatch(/delivery key/i);
});

test("deliver: self-heal — after re-registration the juror decrypts again", async () => {
  // Another origin rotated the key; the local origin finds GET ≠ local pub,
  // re-registers (one signMessage), re-pulls, and decrypts (ADR-0034 §self-heal).
  const { deps } = await rig(false);
  await deps.ingest(SUB, DISPUTE, 0, await postBody());

  // Another origin's key is registered first.
  const otherOrigin = generateDeliveryKey();
  const ts = Date.now();
  const otherSig = ed25519.sign(buildDeliveryKeyMessage(otherOrigin.publicKey, ts), jurorSeed);
  expect(
    (
      await deps.deliveryKeyPut(bs58.encode(jurorPub), {
        enc_pub: bytesToBase64(otherOrigin.publicKey),
        registered_at: ts,
        sig: bytesToBase64(otherSig),
      })
    ).ok,
  ).toBe(true);

  // The local origin re-registers (monotonic ts: strictly later) + re-pulls.
  const localSig = ed25519.sign(
    buildDeliveryKeyMessage(jurorDelivery.publicKey, ts + 1),
    jurorSeed,
  );
  expect(
    (
      await deps.deliveryKeyPut(bs58.encode(jurorPub), {
        enc_pub: bytesToBase64(jurorDelivery.publicKey),
        registered_at: ts + 1,
        sig: bytesToBase64(localSig),
      })
    ).ok,
  ).toBe(true);

  const delivered = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  if (!delivered.ok) throw new Error("unreachable");
  const recovered = await jurorDecryptDelivery(
    {
      out: base64ToBytes(delivered.body.rounds[0]!.out),
      operator_ephem_pub: base64ToBytes(delivered.body.rounds[0]!.operator_ephem_pub),
    },
    jurorDelivery.secretKey,
  );
  expect(recovered).toEqual(PLAINTEXT);
});
