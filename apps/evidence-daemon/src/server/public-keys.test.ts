/**
 * buildKeyringPublicKeys contract (ADR-0011, GET /config).
 *
 * GET /config discloses ONLY the operator Ed25519 public keys — nothing else.
 * These pubkeys are public by construction (== on-chain `evidence_operator`).
 * The security-critical property: the seed (the crown jewel) must never appear
 * in the output, in any encoding.
 */
import { describe, expect, it } from "bun:test";
import bs58 from "bs58";
import { ed25519PublicKeyFromSeed } from "@useaccord/sdk/evidence";

import { EnvKeyring } from "../keys/keyring.js";
import { buildKeyringPublicKeys } from "./public-keys.js";

// Real Ed25519 material — two operators to exercise the array + ordering.
const seedA = new Uint8Array(32).fill(1);
const seedB = new Uint8Array(32).fill(2);
const pubA = ed25519PublicKeyFromSeed(seedA);
const pubB = ed25519PublicKeyFromSeed(seedB);

describe("buildKeyringPublicKeys — public surface", () => {
  it("discloses each operator pubkey in base58 + hex, in insertion order", () => {
    const keyring = EnvKeyring.fromEnv(`${bs58.encode(seedA)},${bs58.encode(seedB)}`);
    const keys = buildKeyringPublicKeys(keyring);

    expect(keys.operators).toEqual([
      { base58: bs58.encode(pubA), hex: Buffer.from(pubA).toString("hex") },
      { base58: bs58.encode(pubB), hex: Buffer.from(pubB).toString("hex") },
    ]);
  });

  it("base58 matches the on-chain evidence_operator form (ed25519 pubkey)", () => {
    const keyring = EnvKeyring.fromEnv(bs58.encode(seedA));
    const keys = buildKeyringPublicKeys(keyring);
    expect(keys.operators[0]?.base58).toBe(bs58.encode(pubA));
  });
});

describe("buildKeyringPublicKeys — secret redaction (non-negotiable)", () => {
  it("never leaks the seed (base58 or hex)", () => {
    const keyring = EnvKeyring.fromEnv(bs58.encode(seedA));
    const serialized = JSON.stringify(buildKeyringPublicKeys(keyring));

    expect(serialized).not.toContain(bs58.encode(seedA));
    expect(serialized).not.toContain(Buffer.from(seedA).toString("hex"));
  });
});
