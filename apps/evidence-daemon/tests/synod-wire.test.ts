// synod-wire.test.ts — wire + route level (bean accord-g1dy): the synod
// ingest route contract and the juror deliver bridge, driven through
// createServerDeps with REAL ECIES crypto, a real encoded-account chain stub
// (SynodCase included), and an in-memory store.
//
// Matrix (milestone accord-daq8 §6):
//   slot guard (route + pipeline), 409 post-file push, deliver bridge happy
//   (juror decrypts each party package), deliver bridge root mismatch → 409.
import { test, expect } from "bun:test";
import { address, type Address } from "@solana/kit";
import bs58 from "bs58";
import { DisputeState } from "@useaccord/sdk";

import {
  claimantEncrypt,
  ed25519PublicKeyFromSeed,
  jurorDecrypt,
  sha256,
} from "@useaccord/sdk/evidence";
import { EnvKeyring } from "../src/keys/keyring";
import {
  base64ToBytes,
  bytesToBase64,
  type EvidenceBundle,
  type EvidenceStore,
} from "../src/store/store";
import { synodEvidenceRoot } from "../src/pipeline/synod-group";
import { createServerDeps } from "../src/wire";
import { createApp } from "../src/server/app";
import { stubAccord } from "./helpers/accordStub.ts";
import type { KeyringPublicKeys } from "../src/server/public-keys";

const operatorSeed = crypto.getRandomValues(new Uint8Array(32));
const operatorPub = ed25519PublicKeyFromSeed(operatorSeed);
const jurorSeed = crypto.getRandomValues(new Uint8Array(32));
const jurorPub = ed25519PublicKeyFromSeed(jurorSeed);

const SUB: Address = address("11111111111111111111111111111111");
const CASE: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DISPUTE: Address = address("E8bqxKAg8LD9jHSjt7LgGTTdXxNH7LBTkZ5y8YBq2dZ6");

const PT0 = new TextEncoder().encode("party-zero evidence");
const PT1 = new TextEncoder().encode("party-one evidence");

const publicKeys: KeyringPublicKeys = {
  operators: [{ base58: bs58.encode(operatorPub), hex: Buffer.from(operatorPub).toString("hex") }],
};

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
  };
}

/** POST body from a real claimant encryption of `pt` to the operator key. */
async function bodyFor(pt: Uint8Array) {
  const b = await claimantEncrypt(pt, operatorPub);
  return {
    ct: bytesToBase64(b.ct),
    claimant_ephem_pub: bytesToBase64(b.claimant_ephem_pub),
    wrapped: bytesToBase64(b.wrapped),
    plaintext_hash: bytesToBase64(b.plaintext_hash),
    hashBytes: b.plaintext_hash,
  };
}

/**
 * Rig a 2-party case. `seedGroup` stores both party bundles at
 * {SUB}/{CASE}/{slot} (as if pushed pre-file — the push path 409s post-file,
 * so the seeded rig is how a filed case's group looks to the daemon).
 * `rootOverride` registers a WRONG on-chain root to force a mismatch.
 */
async function rig(opts: {
  bound: boolean;
  withDispute?: boolean;
  seedGroup?: boolean;
  rootOverride?: Uint8Array;
}) {
  const b0 = await bodyFor(PT0);
  const b1 = await bodyFor(PT1);
  const root =
    opts.rootOverride ??
    (await synodEvidenceRoot(bs58.decode(CASE), [b0.hashBytes, b1.hashBytes], sha256));

  const accord = await stubAccord({
    subaccord: { address: SUB, data: { evidenceOperator: address(bs58.encode(operatorPub)) } },
    synodCase: {
      address: CASE,
      data: {
        subaccord: SUB,
        partyCount: 2,
        dispute: opts.bound ? DISPUTE : address("11111111111111111111111111111111"),
      },
    },
    ...(opts.withDispute
      ? {
          dispute: {
            address: DISPUTE,
            data: {
              subaccord: SUB,
              filer: CASE,
              evidenceHashes: [root, new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
              state: DisputeState.Drawn,
              currentRound: 0,
            },
          },
          round: {
            dispute: DISPUTE,
            roundIdx: 0,
            data: { roundIdx: 0, jurorCount: 1, jurors: [address(bs58.encode(jurorPub))] },
          },
        }
      : {}),
  });
  const store = memoryStore();
  if (opts.seedGroup) {
    const c0 = await claimantEncrypt(PT0, operatorPub);
    const c1 = await claimantEncrypt(PT1, operatorPub);
    await store.put({
      subaccord: SUB,
      dispute: CASE,
      round: 0,
      ct: c0.ct,
      claimantEphemPub: c0.claimant_ephem_pub,
      wrapped: c0.wrapped,
      plaintextHash: c0.plaintext_hash,
      ingestedAt: 1,
    });
    await store.put({
      subaccord: SUB,
      dispute: CASE,
      round: 1,
      ct: c1.ct,
      claimantEphemPub: c1.claimant_ephem_pub,
      wrapped: c1.wrapped,
      plaintextHash: c1.plaintext_hash,
      ingestedAt: 1,
    });
  }
  const deps = createServerDeps({
    store,
    accord,
    keyring: EnvKeyring.fromEnv(bs58.encode(operatorSeed)),
    health: async () => ({ ok: true }),
    publicKeys,
  });
  return { deps, store, app: createApp(deps), b0, b1, root };
}

// ------------------------------------------------- POST /evidence/synod/ ---

test("synod wire: push per party slot → 201, stored grouped at {sub}/{case}/{slot}", async () => {
  const { deps, store } = await rig({ bound: false });
  const malformed = await deps.synodIngest(CASE, 0, { ct: "x" });
  expect(malformed.ok).toBe(false); // structural rejection before chain/store

  const ok0 = await deps.synodIngest(CASE, 0, await bodyFor(PT0));
  expect(ok0.ok).toBe(true);
  const ok1 = await deps.synodIngest(CASE, 1, await bodyFor(PT1));
  expect(ok1.ok).toBe(true);
  expect(store.size()).toBe(2);
  expect(await store.get(SUB, CASE, 0)).not.toBeNull();
  expect(await store.get(SUB, CASE, 1)).not.toBeNull();
});

test("synod wire: slot guard — party 2 on a 2-party case → 400", async () => {
  const { deps } = await rig({ bound: false });
  const res = await deps.synodIngest(CASE, 2, await bodyFor(PT0));
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(400);
});

test("synod wire: route-level slot guard — POST /evidence/synod/:case/7 → 400", async () => {
  const { app } = await rig({ bound: false });
  const res = await app.request(
    new Request(`http://x/evidence/synod/${CASE}/7`, {
      method: "POST",
      body: JSON.stringify({ ct: "x" }),
    }),
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: string };
  expect(body.error).toMatch(/party slot/);
});

test("synod wire: 409 post-file push — bound dispute refuses new bundles", async () => {
  const { deps } = await rig({ bound: true });
  const res = await deps.synodIngest(CASE, 0, await bodyFor(PT0));
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(409);
  expect(res.error).toMatch(/dispute/);
});

// ----------------------------------------------- deliver bridge (wire) ---

test("synod wire: deliver bridge — drawn juror gets one package per party slot", async () => {
  const { deps } = await rig({ bound: true, withDispute: true, seedGroup: true });
  const res = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("unreachable");
  expect(res.status).toBe(200);
  expect(res.body.rounds.map((r) => r.round)).toEqual([0, 1]);

  // Juror decrypts each party package with its own seed.
  const p0 = await jurorDecrypt(
    {
      out: base64ToBytes(res.body.rounds[0]!.out),
      operator_ephem_pub: base64ToBytes(res.body.rounds[0]!.operator_ephem_pub),
    },
    jurorSeed,
  );
  expect(p0).toEqual(PT0);
  const p1 = await jurorDecrypt(
    {
      out: base64ToBytes(res.body.rounds[1]!.out),
      operator_ephem_pub: base64ToBytes(res.body.rounds[1]!.operator_ephem_pub),
    },
    jurorSeed,
  );
  expect(p1).toEqual(PT1);
});

test("synod wire: deliver bridge root mismatch — on-chain root ≠ stored hashes → 409", async () => {
  // Dispute carries a WRONG root (as if the daemon-side group were swapped):
  // the recompute must fail and refuse juror assembly.
  const wrongRoot = new Uint8Array(32).fill(0xab);
  const { deps } = await rig({
    bound: true,
    withDispute: true,
    seedGroup: true,
    rootOverride: wrongRoot,
  });
  const res = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(409);
  expect(res.error).toMatch(/root/);
});

test("synod wire: deliver bridge — unseeded group → 404 (nothing assembled)", async () => {
  const { deps } = await rig({ bound: true, withDispute: true });
  const res = await deps.deliver(DISPUTE, bs58.encode(jurorPub));
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
});

// ------------------------------------------- assembled manifest (wire) ---

test("synod wire: manifest GET — pre-file partial view via the route (precedence over generic manifest)", async () => {
  const { deps, app } = await rig({ bound: false });
  await deps.synodIngest(CASE, 0, await bodyFor(PT0)); // only party 0 pushed

  const res = await app.request(`http://x/evidence/synod/${CASE}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    party_count: number;
    verified: boolean | null;
    parties: Array<{ party: number; present: boolean; manifest?: unknown }>;
  };
  expect(body.party_count).toBe(2);
  expect(body.verified).toBe(null);
  expect(body.parties.map((p) => p.present)).toEqual([true, false]);
  expect(body.parties[0]!.manifest).toBe(new TextDecoder().decode(PT0));
});

test("synod wire: manifest GET — post-file recomputed root matches → verified:true", async () => {
  const { deps } = await rig({ bound: true, withDispute: true, seedGroup: true });
  const res = await deps.synodManifest(CASE);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("unreachable");
  expect(res.status).toBe(200);
  const body = res.body as { verified: boolean | null };
  expect(body.verified).toBe(true);
});

test("synod wire: manifest GET — assembled hashes ≠ evidence_hashes[0] → verified:false", async () => {
  const wrongRoot = new Uint8Array(32).fill(0xcd);
  const { deps } = await rig({
    bound: true,
    withDispute: true,
    seedGroup: true,
    rootOverride: wrongRoot,
  });
  const res = await deps.synodManifest(CASE);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("unreachable");
  const body = res.body as { verified: boolean | null };
  expect(body.verified).toBe(false);
});

test("synod wire: manifest GET — unknown case → 404", async () => {
  const { deps } = await rig({ bound: false });
  const res = await deps.synodManifest(SUB); // no case registered there
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("unreachable");
  expect(res.status).toBe(404);
});
