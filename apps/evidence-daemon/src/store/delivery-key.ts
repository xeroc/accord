/**
 * DeliveryKeyStore trait + JurorDeliveryKey record — the juror Delivery Key
 * registry (ADR-0034). Another `Storage`-seam tenant sharing the evidence
 * deployment's S3 client/bucket or fs rootDir, under the `juror-keys/`
 * namespace: one object per juror, last-writer-wins, never deleted — retention
 * sweeps must never touch the namespace (it is not dispute-scoped).
 *
 * Only `enc_pub` exists server-side; the X25519 secret never leaves the
 * client. The signature + monotonic `registered_at` gates live in the HTTP
 * handler (wire.ts); the store is a dumb map.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Delivery Key registry"; ADR-0034.
 */
import { address, type Address } from "@solana/kit";

import { base64ToBytes, bytesToBase64 } from "./store.js";

/** A juror's registered Delivery Key. */
export interface JurorDeliveryKey {
  /** Wallet pubkey — the map key (base58 path component). */
  readonly juror: Address;
  /** X25519 public key, 32 bytes — the delivery target. */
  readonly encPub: Uint8Array;
  /** Unix ms, from the signed message (monotonic gate input). */
  readonly registeredAt: number;
}

/**
 * Pluggable Delivery Key registry. v1 implementations:
 * {@link ./delivery-key-fs.ts FsDeliveryKeyStore} and
 * {@link ./delivery-key-s3.ts S3DeliveryKeyStore}, key `juror-keys/{juror}`.
 */
export interface DeliveryKeyStore {
  /** Overwrite; the caller gates signature + monotonic `registered_at` first. */
  put(k: JurorDeliveryKey): Promise<void>;
  /** The juror's registered key, or `null` when none is. */
  get(juror: Address): Promise<JurorDeliveryKey | null>;
}

interface KeyJson {
  v: 1;
  juror: string;
  enc_pub: string;
  registered_at: number;
}

/** Serialize a registration to a JSON string (UTF-8). */
export function serializeDeliveryKey(k: JurorDeliveryKey): string {
  const j: KeyJson = {
    v: 1,
    juror: k.juror,
    enc_pub: bytesToBase64(k.encPub),
    registered_at: k.registeredAt,
  };
  return JSON.stringify(j);
}

/** Deserialize a registration. Inverse of {@link serializeDeliveryKey}. */
export function deserializeDeliveryKey(s: string): JurorDeliveryKey {
  const j = JSON.parse(s) as KeyJson;
  if (j.v !== 1) throw new Error(`unsupported JurorDeliveryKey version: ${j.v}`);
  return {
    juror: address(j.juror),
    encPub: base64ToBytes(j.enc_pub),
    registeredAt: j.registered_at,
  };
}
