/**
 * Implementer's self-checks for the crypto core (accord-vknh).
 * The canonical suite is tests/crypto.test.ts (accord-c07y); this file proves the
 * implementation round-trips and is the RED->GREEN driver for ed25519/symmetric/ecies.
 */
import { test, expect } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519";
import {
  sha256,
  hkdfSha256,
  aesGcmEncrypt,
  aesGcmDecrypt,
  constantTimeEqual,
} from "../src/crypto/symmetric";
import {
  ed25519ToX25519PublicKey,
  ed25519SecretToX25519,
  x25519SharedSecret,
  newX25519KeyPair,
} from "../src/keys/ed25519";
import {
  claimantEncrypt,
  operatorDecrypt,
  deliverToJuror,
  jurorDecrypt,
  verifyIntegrity,
  INGEST_INFO,
  DELIVER_INFO,
} from "../src/crypto/ecies";

const enc = new TextEncoder();
const seed = () => crypto.getRandomValues(new Uint8Array(32));
const edPair = () => {
  const sk = seed();
  return { sk, pk: ed25519.getPublicKey(sk) };
};

// --- symmetric -------------------------------------------------------------

test('sha256: known vector ("abc")', async () => {
  const h = await sha256(enc.encode("abc"));
  // RFC 6234 test vector
  expect([...h]).toEqual([
    0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae, 0x22, 0x23,
    0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad,
  ]);
});

test("hkdf: deterministic for (ikm, info); differs across info", async () => {
  const ikm = seed();
  const a1 = await hkdfSha256(ikm, enc.encode(INGEST_INFO));
  const a2 = await hkdfSha256(ikm, enc.encode(INGEST_INFO));
  expect(a1.length).toBe(32);
  expect([...a1]).toEqual([...a2]);
  const b = await hkdfSha256(ikm, enc.encode(DELIVER_INFO));
  expect([...a1]).not.toEqual([...b]);
});

test("AES-256-GCM: round-trip; tamper and wrong-key both throw", async () => {
  const key = seed();
  const pt = enc.encode("secret evidence payload");
  const blob = await aesGcmEncrypt(key, pt);
  expect(blob.length).toBe(12 + pt.length + 16); // nonce + ct + tag
  const back = await aesGcmDecrypt(key, blob);
  expect([...back]).toEqual([...pt]);

  const tampered = blob.slice();
  tampered[tampered.length - 1] ^= 0x01;
  await expect(aesGcmDecrypt(key, tampered)).rejects.toThrow();
  await expect(aesGcmDecrypt(seed(), blob)).rejects.toThrow();
});

test("constantTimeEqual: equal true, differ false, length-mismatch false", () => {
  expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
});

// --- ed25519 <-> X25519 ----------------------------------------------------

test("ed25519->X25519: pubkey + secret conversion are deterministic", () => {
  const { sk, pk } = edPair();
  const xPubA = ed25519ToX25519PublicKey(pk);
  const xPubB = ed25519ToX25519PublicKey(pk);
  expect(xPubA.length).toBe(32);
  expect([...xPubA]).toEqual([...xPubB]);
  const xSk = ed25519SecretToX25519(sk);
  expect(xSk.length).toBe(32);
});

test("X25519 ECDH is symmetric: both parties derive the same shared secret", () => {
  const op = edPair();
  const claimant = newX25519KeyPair();
  const opXSk = ed25519SecretToX25519(op.sk);
  const opXPub = ed25519ToX25519PublicKey(op.pk);
  const s1 = x25519SharedSecret(opXSk, claimant.publicKey);
  const s2 = x25519SharedSecret(claimant.secret, opXPub);
  expect([...s1]).toEqual([...s2]);
});

// --- ECIES ingest ----------------------------------------------------------

test("ingest ECIES: claimant encrypts, operator decrypts to the original plaintext", async () => {
  const op = edPair();
  const plaintext = enc.encode("the dispute evidence body");
  const bundle = await claimantEncrypt(plaintext, op.pk);
  expect(bundle.ct.length).toBeGreaterThan(0);
  expect(bundle.claimant_ephem_pub.length).toBe(32);
  expect(bundle.wrapped.length).toBeGreaterThan(0);
  expect(bundle.plaintext_hash.length).toBe(32);
  const recovered = await operatorDecrypt(bundle, op.sk);
  expect([...recovered]).toEqual([...plaintext]);
});

test("ingest ECIES: a different operator secret cannot decrypt (auth fails)", async () => {
  const op = edPair();
  const other = edPair();
  const bundle = await claimantEncrypt(enc.encode("payload"), op.pk);
  await expect(operatorDecrypt(bundle, other.sk)).rejects.toThrow();
});

test("ingest ECIES: plaintext_hash == sha256(plaintext)", async () => {
  const op = edPair();
  const plaintext = enc.encode("hash me");
  const bundle = await claimantEncrypt(plaintext, op.pk);
  expect([...bundle.plaintext_hash]).toEqual([...(await sha256(plaintext))]);
});

// --- ECIES deliver ---------------------------------------------------------

test("deliver ECIES: operator re-encrypts, juror decrypts to the original plaintext", async () => {
  const juror = edPair();
  const plaintext = enc.encode("re-encrypted for the drawn juror");
  const delivered = await deliverToJuror(plaintext, juror.pk);
  expect(delivered.operator_ephem_pub.length).toBe(32);
  expect(delivered.out.length).toBe(12 + plaintext.length + 16);
  const recovered = await jurorDecrypt(delivered, juror.sk);
  expect([...recovered]).toEqual([...plaintext]);
});

test("deliver ECIES: only the juror's secret decrypts (DoD property)", async () => {
  const juror = edPair();
  const stranger = edPair();
  const delivered = await deliverToJuror(enc.encode("for juror only"), juror.pk);
  await expect(jurorDecrypt(delivered, stranger.sk)).rejects.toThrow();
});

// --- integrity gate --------------------------------------------------------

test("verifyIntegrity: accepts matching hash, rejects tampered plaintext", async () => {
  const op = edPair();
  const plaintext = enc.encode("genuine evidence");
  const bundle = await claimantEncrypt(plaintext, op.pk);
  await expect(verifyIntegrity(plaintext, bundle.plaintext_hash)).resolves.toBeUndefined();
  await expect(verifyIntegrity(enc.encode("tampered"), bundle.plaintext_hash)).rejects.toThrow();
  await expect(verifyIntegrity(plaintext, seed())).rejects.toThrow();
});

// --- full daemon flow ------------------------------------------------------

test("full flow: claimant -> operator -> juror with integrity gate end-to-end", async () => {
  const op = edPair();
  const juror = edPair();
  const plaintext = enc.encode("end-to-end evidence round-trip");

  // claimant -> operator
  const bundle = await claimantEncrypt(plaintext, op.pk);
  const atOperator = await operatorDecrypt(bundle, op.sk); // in-memory only
  await verifyIntegrity(atOperator, bundle.plaintext_hash);

  // operator -> juror
  const delivered = await deliverToJuror(atOperator, juror.pk);
  const atJuror = await jurorDecrypt(delivered, juror.sk);
  await verifyIntegrity(atJuror, bundle.plaintext_hash);

  expect([...atJuror]).toEqual([...plaintext]);
});
