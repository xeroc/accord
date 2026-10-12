// sas.test.ts — matching juror SAS attestations against gated Subaccords
// (ADR-0024 display logic for /juror/browse + /juror/:address).
//
// Run via: pnpm --filter @useaccord/app test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "@solana/kit";
import type { SasAttestation } from "@useaccord/sdk";

import {
  DEFAULT_PUBKEY,
  attachAttestations,
  expiryState,
  isGated,
  isShieldedJuror,
  satisfiesGate,
  type AttestationRef,
  type CredentialBinding,
} from "./sas.ts";

const addr = (seed: string) => seed.padEnd(43, "x").slice(0, 44) as Address;
const binding = (c: Address, s: Address): CredentialBinding => ({
  jurorCredential: c,
  jurorSchema: s,
});

const CRED = addr("cred");
const SCHEMA = addr("schema");
const OTHER_CRED = addr("other");
const WALLET = addr("wallet");
const OTHER_WALLET = addr("otherwallet");

function attestation(overrides: Partial<SasAttestation> = {}): SasAttestation {
  return {
    nonce: new Uint8Array(32),
    credential: CRED,
    schema: SCHEMA,
    wallet: WALLET,
    signer: addr("signer"),
    expiry: 0n,
    ...overrides,
  };
}

test("isGated: default binding is stake-only, set pair is gated", () => {
  assert.equal(isGated(binding(DEFAULT_PUBKEY, DEFAULT_PUBKEY)), false);
  assert.equal(isGated(binding(CRED, SCHEMA)), true);
});

test("satisfiesGate: credential+schema must both match a gated binding", () => {
  const att = attestation();
  assert.equal(satisfiesGate(att, binding(CRED, SCHEMA)), true);
  assert.equal(satisfiesGate(att, binding(OTHER_CRED, SCHEMA)), false);
  assert.equal(satisfiesGate(att, binding(CRED, addr("otherschema"))), false);
  // Stake-only pools never need an attestation.
  assert.equal(satisfiesGate(att, binding(DEFAULT_PUBKEY, DEFAULT_PUBKEY)), false);
});

test("attachAttestations pairs each attestation with the subaccords it unlocks", () => {
  const gatedSub = { address: addr("sub1"), data: binding(CRED, SCHEMA) };
  const otherGatedSub = { address: addr("sub2"), data: binding(OTHER_CRED, SCHEMA) };
  const stakeOnlySub = {
    address: addr("sub3"),
    data: binding(DEFAULT_PUBKEY, DEFAULT_PUBKEY),
  };
  const atts: AttestationRef[] = [
    { address: addr("att1"), data: attestation() },
  ];
  const attached = attachAttestations(atts, [
    gatedSub,
    otherGatedSub,
    stakeOnlySub,
  ]);
  assert.equal(attached.length, 1);
  assert.deepEqual(attached[0].unlocks, [gatedSub.address]);
});

test("isShieldedJuror: attestation must bind the juror to a staked gated pool", () => {
  const atts: AttestationRef[] = [
    { address: addr("att1"), data: attestation() },
  ];
  const gatedStake = [binding(CRED, SCHEMA)];
  assert.equal(isShieldedJuror(WALLET, atts, gatedStake), true);
  // Attestation belongs to another wallet.
  assert.equal(isShieldedJuror(OTHER_WALLET, atts, gatedStake), false);
  // Juror only stakes in stake-only pools — the attestation is irrelevant.
  assert.equal(
    isShieldedJuror(WALLET, atts, [binding(DEFAULT_PUBKEY, DEFAULT_PUBKEY)]),
    false,
  );
  // No attestations at all.
  assert.equal(isShieldedJuror(WALLET, [], gatedStake), false);
});

test("expiryState: zero never expires, past and exact-now are expired", () => {
  const now = 1_700_000_000;
  assert.equal(expiryState(0n, now), "never");
  assert.equal(expiryState(BigInt(now + 1), now), "valid");
  assert.equal(expiryState(BigInt(now - 1), now), "expired");
  assert.equal(expiryState(BigInt(now), now), "expired");
});

test("expiryState: fractional now (Date.now()/1000) does not throw", () => {
  const now = 1_700_000_000.379;
  assert.equal(expiryState(BigInt(Math.floor(now)), now), "expired");
  assert.equal(expiryState(BigInt(Math.floor(now) + 1), now), "valid");
});
