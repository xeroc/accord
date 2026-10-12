// sas.test.ts — SAS (Solana Attestation Service) attestation decoding.
//
// The layout under test mirrors `sas_layout` in programs/accord/src/
// attestation.rs (ADR-0024) byte-for-byte — the on-chain gate parses the same
// account, so the decoder here must agree on every offset:
//   [0]=disc(u8=2) [1..33]=nonce [33..65]=credential [65..97]=schema
//   [97..101]=data_len(u32 LE) [101..]=data (data[0..32]=wallet) signer(32)
//   expiry(i64 LE; 0 ⇒ never expires)
//
// Run via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddressDecoder, getAddressEncoder, type Address } from "@solana/kit";

import {
  SAS_ATTESTATION_MIN_LEN,
  SAS_PROGRAM_ID,
  decodeSasAttestation,
} from "./sas.ts";

const addressDecoder = getAddressDecoder();
const addressEncoder = getAddressEncoder();

/** 32 raw bytes filled with a seed byte — decodes to a valid `Address`. */
function seededAddress(seed: number): Address {
  return addressDecoder.decode(new Uint8Array(32).fill(seed));
}

const CREDENTIAL = seededAddress(0x11);
const SCHEMA = seededAddress(0x22);
const WALLET = seededAddress(0x33);
const SIGNER = seededAddress(0x44);

interface AttestationFixture {
  disc?: number;
  dataLen?: number;
  expiry?: bigint;
}

/** Hand-build a raw SAS Attestation body (mirror of the e2e `makeSasAttestation`). */
function buildAttestation({
  disc = 2,
  dataLen = 32,
  expiry = 0n,
}: AttestationFixture = {}): Uint8Array {
  const expiryOff = 101 + dataLen + 32;
  const buf = new Uint8Array(expiryOff + 8);
  const dv = new DataView(buf.buffer);
  buf[0] = disc;
  buf.fill(0xab, 1, 33); // nonce
  buf.set(addressEncoder.encode(CREDENTIAL), 33);
  buf.set(addressEncoder.encode(SCHEMA), 65);
  dv.setUint32(97, dataLen, true);
  buf.set(addressEncoder.encode(WALLET), 101); // data[0..32] = subject
  buf.set(addressEncoder.encode(SIGNER), 101 + dataLen);
  dv.setBigInt64(expiryOff, expiry, true);
  return buf;
}

test("decodes fixed fields and never-expires", () => {
  const view = decodeSasAttestation(buildAttestation());
  assert.equal(view.credential, CREDENTIAL);
  assert.equal(view.schema, SCHEMA);
  assert.equal(view.wallet, WALLET);
  assert.equal(view.signer, SIGNER);
  assert.equal(view.expiry, 0n);
  assert.equal(view.nonce.length, 32);
  assert.equal(view.nonce[0], 0xab);
});

test("expiry offset is dynamic across data_len values", () => {
  for (const dataLen of [32, 48, 100, 256]) {
    const expiry = 1_700_000_000n + BigInt(dataLen);
    const view = decodeSasAttestation(buildAttestation({ dataLen, expiry }));
    assert.equal(view.expiry, expiry, `dataLen=${dataLen}`);
    // wallet stays fixed-offset regardless of data_len
    assert.equal(view.wallet, WALLET);
  }
});

test("rejects wrong discriminator", () => {
  assert.throws(() => decodeSasAttestation(buildAttestation({ disc: 9 })));
});

test("rejects accounts shorter than the minimum length", () => {
  assert.throws(() => decodeSasAttestation(buildAttestation().slice(0, 172)));
  assert.equal(SAS_ATTESTATION_MIN_LEN, 173);
});

test("rejects data_len below the 32-byte wallet binding", () => {
  assert.throws(() => decodeSasAttestation(buildAttestation({ dataLen: 31 })));
});

test("rejects a truncated expiry tail", () => {
  const buf = buildAttestation({ dataLen: 64, expiry: 123n });
  assert.throws(() => decodeSasAttestation(buf.slice(0, buf.length - 1)));
});

test("SAS program id is pinned to the deployed program", () => {
  assert.equal(SAS_PROGRAM_ID, "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG");
});
