/**
 * evidence/delivery-key.ts — juror Delivery Keys (ADR-0034, amends
 * ADR-0015 / ADR-0011).
 *
 * A Delivery Key is a browser-held X25519 keypair registered at the evidence
 * daemon under a wallet `signMessage` binding: the juror signs
 * `accord-delkey-v1\nregistered_at:{ms}\nenc_pub:{base58}` with its Solana
 * (Ed25519) key and PUTs it to `/jurors/{juror}/delivery-key`. Delivery then
 * targets the registered X25519 key — no registered key ⇒ no delivery (404).
 * There is no Ed→X fallback anywhere in delivery; Ed↔X dual-use survives only
 * on the claimant→operator ingest path.
 *
 * Custody: the raw 32-byte secret stays in origin-scoped browser storage; apps
 * wire the storage via the {@link DeliveryKeyStorage} port (IndexedDB,
 * localStorage, whatever) — the SDK owns only the codec + this protocol.
 * One active key per juror per daemon, last-writer-wins; rotation =
 * re-register (a higher `registered_at` wins) + re-pull — nothing stored is
 * keyed, delivery re-encrypts per request.
 *
 * Multi-origin self-heal: GET the registered key, compare with the local pub,
 * mismatch ⇒ re-register + re-pull ({@link ensureRegisteredDeliveryKey}).
 *
 * Authority: ADR-0034; apps/evidence-daemon/SPEC.md §Crypto model.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { getBase58Decoder } from "@solana/kit";

import { fromBase64, toBase64 } from "./base64.js";
import { newX25519KeyPair } from "./keys.js";

const te = new TextEncoder();

/** Prefix pinning the registration message to `accord-delkey-v1` (ADR-0034). */
export const DELKEY_PREFIX = "accord-delkey-v1";

/** A juror-held X25519 Delivery Keypair. The secret never leaves origin storage. */
export interface DeliveryKeypair {
  /** 32-byte X25519 public key — what gets registered at the daemon. */
  publicKey: Uint8Array;
  /** 32-byte X25519 secret key. */
  secretKey: Uint8Array;
}

/** Fresh Delivery Keypair (noble X25519; ADR-0034 custody model). */
export function generateDeliveryKey(): DeliveryKeypair {
  const pair = newX25519KeyPair();
  return { publicKey: pair.publicKey, secretKey: pair.secret };
}

// ---------------------------------------------------------------------------
// Registration message + signature verification (shared with the daemon)
// ---------------------------------------------------------------------------

/**
 * The wallet-signed registration message:
 * `accord-delkey-v1\nregistered_at:{ms}\nenc_pub:{base58}`.
 * `registered_at` is Unix ms; the daemon rejects `registered_at <= stored`
 * (kills replay-downgrade of an exfiltrated superseded key).
 */
export function buildDeliveryKeyMessage(
  encPub: Uint8Array,
  registeredAtMs: number,
): Uint8Array {
  requireLen(encPub, 32, "delivery enc_pub");
  if (!Number.isSafeInteger(registeredAtMs) || registeredAtMs < 0) {
    throw new Error(`registered_at must be a non-negative integer (ms), got ${registeredAtMs}`);
  }
  const b58 = getBase58Decoder().decode(encPub);
  return te.encode(`${DELKEY_PREFIX}\nregistered_at:${registeredAtMs}\nenc_pub:${b58}`);
}

/**
 * Daemon-shared verification of a registration signature: Ed25519 over
 * {@link buildDeliveryKeyMessage} by the juror's Solana key. Returns false for
 * a bad signature OR malformed inputs (the daemon maps false → 400).
 */
export function verifyDeliveryKeyRegistration(
  jurorEd25519Pub: Uint8Array,
  encPub: Uint8Array,
  registeredAtMs: number,
  sig: Uint8Array,
): boolean {
  try {
    const msg = buildDeliveryKeyMessage(encPub, registeredAtMs);
    return ed25519.verify(sig, msg, jurorEd25519Pub);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Daemon HTTP: register / get / ensure-registered
// ---------------------------------------------------------------------------

/** Wallet `signMessage` seam (app wires its wallet adapter; ADR-0015 split). */
export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export interface RegisterDeliveryKeyParams {
  /** Daemon base URL (app-side `EVIDENCE_DAEMON_URL`). */
  endpoint: string;
  /** Juror's Solana address, base58. */
  juror: string;
  /** Delivery public key to register (32 bytes). */
  encPub: Uint8Array;
  /** Wallet signMessage — signs the registration message (Ed25519). */
  signMessage: SignMessage;
}

/** Registration result echoed by the daemon on 201. */
export interface RegisteredDeliveryKey {
  encPub: Uint8Array;
  registeredAt: number;
}

/**
 * Register (or rotate) the juror's Delivery Key:
 * `PUT /jurors/{juror}/delivery-key` {enc_pub, registered_at, sig} → 201.
 * Throws on 400 (bad sig/body) and 409 (stale `registered_at` — retry later).
 */
export async function registerDeliveryKey(
  params: RegisterDeliveryKeyParams,
): Promise<RegisteredDeliveryKey> {
  const { endpoint, juror, encPub, signMessage } = params;
  const registeredAt = Date.now();
  const sig = await signMessage(buildDeliveryKeyMessage(encPub, registeredAt));
  const res = await fetch(`${endpoint}/jurors/${juror}/delivery-key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      enc_pub: toBase64(encPub),
      registered_at: registeredAt,
      sig: toBase64(sig),
    }),
  });
  if (res.status !== 201) {
    const body = await res.text().catch(() => "");
    throw new Error(`delivery-key registration failed: ${res.status} ${body}`);
  }
  return { encPub, registeredAt };
}

/**
 * The currently registered Delivery Key:
 * `GET /jurors/{juror}/delivery-key` → 200 {enc_pub, registered_at} | 404 → null.
 */
export async function getRegisteredDeliveryKey(params: {
  endpoint: string;
  juror: string;
}): Promise<RegisteredDeliveryKey | null> {
  const res = await fetch(`${params.endpoint}/jurors/${params.juror}/delivery-key`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`evidence daemon returned ${res.status}`);
  const body = (await res.json()) as { enc_pub?: unknown; registered_at?: unknown };
  if (typeof body.enc_pub !== "string" || typeof body.registered_at !== "number") {
    throw new Error("delivery-key response malformed");
  }
  return { encPub: fromBase64(body.enc_pub), registeredAt: body.registered_at };
}

/**
 * Multi-origin self-heal (ADR-0034): compare the daemon's registered key with
 * the local one; mismatch (or none registered — another origin rotated) ⇒
 * re-register with one `signMessage`. Returns `"current"` when already bound,
 * `"re-registered"` after a fresh PUT — then re-pull the delivery.
 */
export async function ensureRegisteredDeliveryKey(
  params: RegisterDeliveryKeyParams,
): Promise<"current" | "re-registered"> {
  const current = await getRegisteredDeliveryKey(params);
  if (
    current !== null &&
    current.encPub.length === params.encPub.length &&
    current.encPub.every((b, i) => b === params.encPub[i])
  ) {
    return "current";
  }
  await registerDeliveryKey(params);
  return "re-registered";
}

// ---------------------------------------------------------------------------
// Persistence codec + storage port (custody stays app-side, ADR-0034)
// ---------------------------------------------------------------------------

/** Serialized form: `publicKey(32) ‖ secretKey(32)`. */
export function encodeDeliveryKeypair(kp: DeliveryKeypair): Uint8Array {
  requireLen(kp.publicKey, 32, "delivery public key");
  requireLen(kp.secretKey, 32, "delivery secret key");
  const out = new Uint8Array(64);
  out.set(kp.publicKey, 0);
  out.set(kp.secretKey, 32);
  return out;
}

/** Inverse of {@link encodeDeliveryKeypair}; throws on a wrong length. */
export function decodeDeliveryKeypair(bytes: Uint8Array): DeliveryKeypair {
  requireLen(bytes, 64, "serialized delivery keypair");
  return { publicKey: bytes.slice(0, 32), secretKey: bytes.slice(32) };
}

/**
 * Origin-scoped storage port for the serialized keypair. Apps implement it
 * over IndexedDB / localStorage / whatever the origin offers — the SDK owns
 * only the codec, keeping DOM typing out of this module.
 */
export interface DeliveryKeyStorage {
  get(): Promise<Uint8Array | null>;
  set(serialized: Uint8Array): Promise<void>;
}

/**
 * Load the origin's Delivery Key, generating + persisting one on first use.
 * Generate-once semantics: every call on an empty store MUST return the same
 * keypair — re-generating would orphan the daemon registration.
 */
export async function loadOrCreateDeliveryKey(
  storage: DeliveryKeyStorage,
): Promise<DeliveryKeypair> {
  const stored = await storage.get();
  if (stored !== null) return decodeDeliveryKeypair(stored);
  const kp = generateDeliveryKey();
  await storage.set(encodeDeliveryKeypair(kp));
  return kp;
}

// --- internal ---------------------------------------------------------------

function requireLen(b: Uint8Array, n: number, what: string): void {
  if (b.length !== n) {
    throw new Error(`${what} must be ${n} bytes, got ${b.length}`);
  }
}
