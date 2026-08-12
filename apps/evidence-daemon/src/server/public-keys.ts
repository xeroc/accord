/**
 * Public keyring keys served at GET /config (ADR-0011).
 *
 * The daemon discloses ONLY the operator Ed25519 public keys loaded into its
 * keyring — nothing else. Those pubkeys are public by construction: they equal
 * the on-chain `Subaccord.evidence_operator` set any reader can fetch directly.
 * The seeds (the crown jewels) never leave {@link EnvKeyring}; this module has
 * no access to them.
 *
 * No other configuration (RPC, storage, HTTP tuning, credentials) is exposed.
 */
import bs58 from "bs58";
import type { EnvKeyring } from "../keys/keyring.js";

/** One operator public key in two common encodings (the same key, twice). */
export interface PublicKeyEntry {
  /** Ed25519 public key, base58 (Solana-native — == on-chain `evidence_operator`). */
  readonly base58: string;
  /** Same key as lowercase hex (32 bytes / 64 chars). */
  readonly hex: string;
}

/** The entire public surface: the operator public keys, nothing else. */
export interface KeyringPublicKeys {
  readonly operators: readonly PublicKeyEntry[];
}

/**
 * Build the public-key snapshot from the keyring. Pure: no I/O, no clocks, no
 * access to seeds. Call once at boot (`main.ts`) and inject the result; GET
 * /config serves it verbatim.
 */
export function buildKeyringPublicKeys(keyring: EnvKeyring): KeyringPublicKeys {
  return {
    operators: keyring.publicKeys.map((pub) => ({
      base58: bs58.encode(pub),
      hex: Buffer.from(pub).toString("hex"),
    })),
  };
}
