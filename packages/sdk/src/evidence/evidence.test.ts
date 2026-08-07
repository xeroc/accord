// evidence.test.ts — Accord evidence protocol self-check (ADR-0006).
//
// Proves the @accord/sdk/evidence surface is self-consistent and that every
// primitive conforms to its standard: SHA-256 (RFC 6234), HKDF-SHA256
// (RFC 5869 Test Case 1), AES-256-GCM (round-trip + auth), Ed25519<->X25519
// (ECDH symmetry), and the ECIES ingest/deliver envelopes — including the DoD
// property that ONLY the drawn juror's Ed25519 secret decrypts a delivered
// bundle. This is the byte-exact reference the evidence-daemon, claimant SDK
// clients, and juror SDK clients all import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  claimantEncrypt,
  DELIVER_INFO,
  deliverToJuror,
  ed25519SecretToX25519,
  ed25519ToX25519PublicKey,
  hkdfSha256,
  INGEST_INFO,
  jurorDecrypt,
  newX25519KeyPair,
  operatorDecrypt,
  sha256,
  verifyIntegrity,
  x25519SharedSecret,
} from "../../dist/evidence/index.js";

const enc = new TextEncoder();
const rnd32 = () => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
};
const edPair = () => {
  const sk = rnd32();
  return { sk, pk: ed25519.getPublicKey(sk) };
};
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

// ---------------------------------------------------------------------------
// SHA-256 (RFC 6234 known-answer)
// ---------------------------------------------------------------------------

test("sha256 matches the RFC 6234 vector for 'abc'", async () => {
  const h = await sha256(enc.encode("abc"));
  assert.equal(
    hex(h),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

// ---------------------------------------------------------------------------
// HKDF-SHA256
// ---------------------------------------------------------------------------

test("hkdf conforms to RFC 5869 Test Case 1 (validates the @noble/hashes lib)", () => {
  const ikm = Buffer.from("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", "hex");
  const salt = Buffer.from("000102030405060708090a0b0c", "hex");
  const info = Buffer.from("f0f1f2f3f4f5f6f7f8f9", "hex");
  const okm = hkdf(nobleSha256, ikm, salt, info, 42);
  // OKM cross-validated against Node's independent crypto.hkdfSync (RFC 5869 §A.1).
  assert.equal(hex(okm), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
});

test("hkdfSha256 (empty-salt wrapper) is deterministic, length-correct, info-sensitive", async () => {
  const ikm = rnd32();
  const a = await hkdfSha256(ikm, enc.encode(INGEST_INFO));
  const b = await hkdfSha256(ikm, enc.encode(INGEST_INFO));
  assert.equal(a.length, 32);
  assert.deepEqual(a, b);
  // different info label -> different key
  const c = await hkdfSha256(ikm, enc.encode(DELIVER_INFO));
  assert.notDeepEqual(a, c);
  // length honoured
  const long = await hkdfSha256(ikm, enc.encode(INGEST_INFO), 64);
  assert.equal(long.length, 64);
});

// ---------------------------------------------------------------------------
// AES-256-GCM (wire format = nonce(12) ‖ ct ‖ tag(16))
// ---------------------------------------------------------------------------

test("AES-256-GCM round-trip restores plaintext", async () => {
  const key = rnd32();
  const pt = enc.encode("evidence payload");
  const blob = await aesGcmEncrypt(key, pt);
  assert.deepEqual(await aesGcmDecrypt(key, blob), pt);
});

test("AES-GCM blob wire format is nonce(12) ‖ ct ‖ tag(16)", async () => {
  const key = rnd32();
  const pt = enc.encode("x");
  const blob = await aesGcmEncrypt(key, pt);
  assert.equal(blob.length, 12 + pt.length + 16);
});

test("AES-GCM rejects a tampered ciphertext (auth tag)", async () => {
  const key = rnd32();
  const blob = await aesGcmEncrypt(key, enc.encode("secret"));
  const tampered = blob.slice();
  tampered[tampered.length - 1] ^= 0x01;
  await assert.rejects(() => aesGcmDecrypt(key, tampered));
});

test("AES-GCM rejects a wrong key", async () => {
  const key = rnd32();
  const blob = await aesGcmEncrypt(key, enc.encode("secret"));
  await assert.rejects(() => aesGcmDecrypt(rnd32(), blob));
});

// ---------------------------------------------------------------------------
// Ed25519 <-> X25519
// ---------------------------------------------------------------------------

test("Ed->X25519 pubkey conversion is deterministic and 32 bytes", () => {
  const { pk } = edPair();
  const a = ed25519ToX25519PublicKey(pk);
  const b = ed25519ToX25519PublicKey(pk);
  assert.equal(a.length, 32);
  assert.deepEqual(a, b);
});

test("Ed25519 secret -> X25519 secret conversion is deterministic and 32 bytes", () => {
  const { sk } = edPair();
  const a = ed25519SecretToX25519(sk);
  const b = ed25519SecretToX25519(sk);
  assert.equal(a.length, 32);
  assert.deepEqual(a, b);
});

test("distinct Ed25519 keys map to distinct X25519 keys", () => {
  const x = edPair();
  const y = edPair();
  assert.notDeepEqual(ed25519ToX25519PublicKey(x.pk), ed25519ToX25519PublicKey(y.pk));
});

test("X25519 ECDH is symmetric: both parties derive the same shared secret", () => {
  const alice = newX25519KeyPair();
  const bob = newX25519KeyPair();
  assert.deepEqual(
    x25519SharedSecret(alice.secret, bob.publicKey),
    x25519SharedSecret(bob.secret, alice.publicKey),
  );
});

test("Ed->X25519 round-trip via ECDH end-to-end (ingest + deliver shared secrets agree)", () => {
  const op = edPair();
  const claimant = newX25519KeyPair();
  const juror = edPair();
  const opEphem = newX25519KeyPair();

  // ingest direction: claimant ephemeral -> operator
  const sharedInClaimant = x25519SharedSecret(
    claimant.secret,
    ed25519ToX25519PublicKey(op.pk),
  );
  const sharedInOperator = x25519SharedSecret(
    ed25519SecretToX25519(op.sk),
    claimant.publicKey,
  );
  assert.deepEqual(sharedInClaimant, sharedInOperator);

  // deliver direction: operator ephemeral -> juror
  const sharedOutOperator = x25519SharedSecret(
    opEphem.secret,
    ed25519ToX25519PublicKey(juror.pk),
  );
  const sharedOutJuror = x25519SharedSecret(
    ed25519SecretToX25519(juror.sk),
    opEphem.publicKey,
  );
  assert.deepEqual(sharedOutOperator, sharedOutJuror);
});

// ---------------------------------------------------------------------------
// ECIES ingest + deliver
// ---------------------------------------------------------------------------

test("ECIES ingest: claimant encrypt -> operator decrypt round-trip", async () => {
  const op = edPair();
  const pt = enc.encode("top-secret evidence");
  const bundle = await claimantEncrypt(pt, op.pk);
  assert.deepEqual(await operatorDecrypt(bundle, op.sk), pt);
});

test("ECIES ingest: bundle fields are well-formed", async () => {
  const op = edPair();
  const bundle = await claimantEncrypt(enc.encode("p"), op.pk);
  assert.equal(bundle.claimant_ephem_pub.length, 32);
  assert.equal(bundle.plaintext_hash.length, 32);
  assert.ok(bundle.ct.length > 12 + 16);
  assert.ok(bundle.wrapped.length > 12 + 16);
});

test("ECIES ingest: plaintext_hash == sha256(plaintext)", async () => {
  const op = edPair();
  const pt = enc.encode("hash me");
  const bundle = await claimantEncrypt(pt, op.pk);
  assert.deepEqual(bundle.plaintext_hash, await sha256(pt));
});

test("ECIES ingest: a different operator secret cannot decrypt", async () => {
  const op = edPair();
  const stranger = edPair();
  const bundle = await claimantEncrypt(enc.encode("p"), op.pk);
  await assert.rejects(() => operatorDecrypt(bundle, stranger.sk));
});

test("ECIES deliver: operator re-encrypt -> juror decrypt round-trip", async () => {
  const juror = edPair();
  const pt = enc.encode("for the juror's eyes");
  const delivered = await deliverToJuror(pt, juror.pk);
  assert.deepEqual(await jurorDecrypt(delivered, juror.sk), pt);
});

// ---------------------------------------------------------------------------
// DoD property: ONLY the juror's Ed25519 secret decrypts a delivered bundle
// ---------------------------------------------------------------------------

test("PROPERTY: only the juror secret decrypts; every stranger key fails", async () => {
  const juror = edPair();
  const delivered = await deliverToJuror(enc.encode("attributable"), juror.pk);
  for (let i = 0; i < 8; i++) {
    const stranger = edPair();
    await assert.rejects(() => jurorDecrypt(delivered, stranger.sk));
  }
  // sanity: the real juror still decrypts
  const pt = await jurorDecrypt(delivered, juror.sk);
  assert.equal(new TextDecoder().decode(pt), "attributable");
});

test("PROPERTY: each delivery uses a fresh ephemeral key (out bytes differ, plaintext same)", async () => {
  const juror = edPair();
  const pt = enc.encode("replay-safe");
  const a = await deliverToJuror(pt, juror.pk);
  const b = await deliverToJuror(pt, juror.pk);
  assert.notDeepEqual(a.out, b.out);
  assert.notDeepEqual(a.operator_ephem_pub, b.operator_ephem_pub);
  assert.deepEqual(await jurorDecrypt(a, juror.sk), await jurorDecrypt(b, juror.sk));
});

// ---------------------------------------------------------------------------
// Integrity gate
// ---------------------------------------------------------------------------

test("integrity gate accepts the correct hash and rejects tampering", async () => {
  const pt = enc.encode("gated evidence");
  const hash = await sha256(pt);
  await verifyIntegrity(pt, hash); // does not throw
  const tampered = enc.encode("tampered evidence");
  await assert.rejects(() => verifyIntegrity(tampered, hash));
  await assert.rejects(() => verifyIntegrity(pt, rnd32()));
});
