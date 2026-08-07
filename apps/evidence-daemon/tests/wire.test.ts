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
import { DisputeState, type Accord } from "@accord/sdk";

import {
  claimantEncrypt,
  jurorDecrypt,
  sha256,
  ed25519PublicKeyFromSeed,
} from "@accord/sdk/evidence";
import { EnvKeyring } from "../src/keys/keyring";
import {
  bytesToBase64,
  base64ToBytes,
  type EvidenceBundle,
  type EvidenceStore,
} from "../src/store/store";
import { createServerDeps } from "../src/wire";

// --- key fixtures: real Ed25519 keys (crypto needs genuine material) -------
const operatorSeed = crypto.getRandomValues(new Uint8Array(32));
const operatorPub = ed25519PublicKeyFromSeed(operatorSeed);
const jurorSeed = crypto.getRandomValues(new Uint8Array(32));
const jurorPub = ed25519PublicKeyFromSeed(jurorSeed);

// Path addresses (arbitrary valid base58; the system-program id = 32 zero bytes).
const SUB: Address = address("11111111111111111111111111111111");
const DISPUTE: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const PLAINTEXT = new TextEncoder().encode("top-secret evidence payload");

/** Minimal Accord stub returning controlled maybe-accounts (cf. reader.test.ts). */
function stubAccord(accounts: {
  subaccord?: { exists: true; data: Record<string, unknown> } | { exists: false };
  dispute?: { exists: true; data: Record<string, unknown> } | { exists: false };
  round?: { exists: true; data: Record<string, unknown> } | { exists: false };
}): Accord {
  const mk = (m: { exists: true; data: unknown } | { exists: false } | undefined) => async () =>
    m ?? { exists: false };
  return {
    client: {
      accord: {
        accounts: {
          subaccord: { fetchMaybe: mk(accounts.subaccord) },
          dispute: { fetchMaybe: mk(accounts.dispute) },
          round: { fetchMaybe: mk(accounts.round) },
        },
      },
    },
  } as unknown as Accord;
}

/** In-memory EvidenceStore stand-in (exercises the bundle-shape adapter). */
function memoryStore(): EvidenceStore & { size: () => number } {
  const objects = new Map<string, EvidenceBundle>();
  const key = (sa: Address, d: Address) => `${sa}/${d}`;
  return {
    size: () => objects.size,
    async put(b) {
      objects.set(key(b.subaccord, b.dispute), b);
    },
    async get(sa, d) {
      return objects.get(key(sa, d)) ?? null;
    },
    async delete(sa, d) {
      objects.delete(key(sa, d));
    },
    async exists(sa, d) {
      return objects.has(key(sa, d));
    },
  };
}

async function rig() {
  const evidenceHash = await sha256(PLAINTEXT);
  const accord = stubAccord({
    subaccord: {
      exists: true,
      data: {
        evidenceOperator: address(bs58.encode(operatorPub)),
        evidenceSpec: new Uint8Array(32),
      },
    },
    dispute: {
      exists: true,
      data: { subaccord: SUB, evidenceHash, state: DisputeState.Drawn, currentRound: 0 },
    },
    round: {
      exists: true,
      data: { roundIdx: 0, jurorCount: 1, jurors: [address(bs58.encode(jurorPub))] },
    },
  });
  const keyring = EnvKeyring.fromEnv(bs58.encode(operatorSeed));
  const store = memoryStore();
  const deps = createServerDeps({
    store,
    accord,
    keyring,
    health: async () => ({ ok: true }),
  });
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

  const ingested = await deps.ingest(SUB, DISPUTE, body);
  expect(ingested.ok).toBe(true);
  if (!ingested.ok) throw new Error("unreachable");
  expect(ingested.status).toBe(201);
  expect(ingested.location).toBe(`/evidence/${SUB}/${DISPUTE}`);
  expect(store.size()).toBe(1); // ciphertext object persisted, plaintext never

  const delivered = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  expect(delivered.ok).toBe(true);
  if (!delivered.ok) throw new Error("unreachable");
  expect(delivered.status).toBe(200);

  // Juror decrypts with its own seed — recovers exactly the claimant's plaintext.
  const recovered = await jurorDecrypt(
    {
      out: base64ToBytes(delivered.body.out),
      operator_ephem_pub: base64ToBytes(delivered.body.operator_ephem_pub),
    },
    jurorSeed,
  );
  expect(recovered).toEqual(PLAINTEXT);
});

test("wire: re-POST of the same plaintext_hash is idempotent (single object)", async () => {
  const { deps, store } = await rig();
  const body = await postBody();
  const first = await deps.ingest(SUB, DISPUTE, body);
  const second = await deps.ingest(SUB, DISPUTE, body);
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(store.size()).toBe(1);
});

test("wire: deliver by a non-drawn juror → 404", async () => {
  const { deps } = await rig();
  await deps.ingest(SUB, DISPUTE, await postBody());
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
  const accord = stubAccord({ dispute: { exists: false } });
  const deps = createServerDeps({ store, accord, keyring, health: async () => ({ ok: true }) });
  const res = await deps.ingest(SUB, DISPUTE, await postBody());
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
});

test("wire: malformed POST body (missing fields) → 400", async () => {
  const { deps } = await rig();
  const res = await deps.ingest(SUB, DISPUTE, { ct: "not-enough" });
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(400);
});

test("wire: a different juror's seed cannot decrypt the delivered bundle", async () => {
  const { deps } = await rig();
  await deps.ingest(SUB, DISPUTE, await postBody());
  const delivered = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  if (!delivered.ok) throw new Error("unreachable");
  const stranger = crypto.getRandomValues(new Uint8Array(32));
  await expect(
    jurorDecrypt(
      {
        out: base64ToBytes(delivered.body.out),
        operator_ephem_pub: base64ToBytes(delivered.body.operator_ephem_pub),
      },
      stranger,
    ),
  ).rejects.toThrow();
});
