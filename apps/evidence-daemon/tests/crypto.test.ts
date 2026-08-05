/**
 * Canonical crypto-foundation suite (accord-c07y).
 *
 * Authority for DoD §5 items 1-2: Ed25519<->X25519 round-trips, ECIES enc->dec,
 * AES-256-GCM / HKDF-SHA256, the integrity gate (accept/reject), EnvKeyring map
 * correctness, and the property that ONLY the juror's Ed25519 secret can decrypt
 * a delivered bundle. See SPEC §Crypto model, §Testing strategy, §6 Test Matrix.
 */
import { test, expect } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
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
import { EnvKeyring } from "../src/keys/keyring";

const enc = new TextEncoder();
const rnd32 = () => crypto.getRandomValues(new Uint8Array(32));
const edPair = () => {
  const sk = rnd32();
  return { sk, pk: ed25519.getPublicKey(sk) };
};

// ---------------------------------------------------------------------------
// Ed25519 <-> X25519
// ---------------------------------------------------------------------------

test("Ed->X25519 pubkey conversion is deterministic and 32 bytes", () => {
  const { pk } = edPair();
  const a = ed25519ToX25519PublicKey(pk);
  const b = ed25519ToX25519PublicKey(pk);
  expect(a.length).toBe(32);
  expect([...a]).toEqual([...b]);
});

test("Ed25519 secret -> X25519 secret conversion is deterministic and 32 bytes", () => {
  const { sk } = edPair();
  expect(ed25519SecretToX25519(sk).length).toBe(32);
  expect([...ed25519SecretToX25519(sk)]).toEqual([...ed25519SecretToX25519(sk)]);
});

test("distinct Ed25519 keys map to distinct X25519 keys", () => {
  const x1 = ed25519ToX25519PublicKey(edPair().pk);
  const x2 = ed25519ToX25519PublicKey(edPair().pk);
  expect([...x1]).not.toEqual([...x2]);
});

test("X25519 ECDH is symmetric: both parties derive the same shared secret", () => {
  const op = edPair();
  const claimant = newX25519KeyPair();
  const fromOp = x25519SharedSecret(ed25519SecretToX25519(op.sk), claimant.publicKey);
  const fromClaimant = x25519SharedSecret(claimant.secret, ed25519ToX25519PublicKey(op.pk));
  expect([...fromOp]).toEqual([...fromClaimant]);
});

test("Ed->X25519 round-trip via ECDH end-to-end (ingest + deliver shared secrets agree)", () => {
  const op = edPair();
  const juror = edPair();
  // operator decrypting what claimant encrypted
  const claimant = newX25519KeyPair();
  const cShared = x25519SharedSecret(claimant.secret, ed25519ToX25519PublicKey(op.pk));
  const oShared = x25519SharedSecret(ed25519SecretToX25519(op.sk), claimant.publicKey);
  expect([...cShared]).toEqual([...oShared]);
  // juror-side not confused with operator-side shared
  const jShared = x25519SharedSecret(ed25519SecretToX25519(juror.sk), claimant.publicKey);
  expect([...jShared]).not.toEqual([...oShared]);
});

// ---------------------------------------------------------------------------
// AES-256-GCM / HKDF-SHA256 / sha256
// ---------------------------------------------------------------------------

test('sha256 matches the RFC 6234 vector for "abc"', async () => {
  const h = await sha256(enc.encode("abc"));
  expect([...h]).toEqual([
    0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae, 0x22, 0x23,
    0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad,
  ]);
});

test("AES-256-GCM round-trip restores plaintext", async () => {
  const key = rnd32();
  const pt = enc.encode("evidence body");
  expect([...(await aesGcmDecrypt(key, await aesGcmEncrypt(key, pt)))]).toEqual([...pt]);
});

test("AES-GCM blob wire format is nonce(12)||ct||tag(16)", async () => {
  const blob = await aesGcmEncrypt(rnd32(), enc.encode("x"));
  expect(blob.length).toBe(12 + 1 + 16);
});

test("AES-GCM rejects a tampered ciphertext (auth tag)", async () => {
  const key = rnd32();
  const blob = await aesGcmEncrypt(key, enc.encode("sealed"));
  const tampered = blob.slice();
  tampered[tampered.length - 1] ^= 0x01;
  await expect(aesGcmDecrypt(key, tampered)).rejects.toThrow();
});

test("AES-GCM rejects a wrong key", async () => {
  const blob = await aesGcmEncrypt(rnd32(), enc.encode("sealed"));
  await expect(aesGcmDecrypt(rnd32(), blob)).rejects.toThrow();
});

test("HKDF-SHA256 is deterministic and separates by info label", async () => {
  const ikm = rnd32();
  const a = await hkdfSha256(ikm, enc.encode(INGEST_INFO));
  const b = await hkdfSha256(ikm, enc.encode(DELIVER_INFO));
  expect(a.length).toBe(32);
  expect([...a]).toEqual([...(await hkdfSha256(ikm, enc.encode(INGEST_INFO)))]);
  expect([...a]).not.toEqual([...b]);
});

test("constantTimeEqual: equal true; differ false; length-mismatch false", () => {
  expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
});

// ---------------------------------------------------------------------------
// ECIES ingest + deliver
// ---------------------------------------------------------------------------

test("ECIES ingest: claimant encrypt -> operator decrypt round-trip", async () => {
  const op = edPair();
  const plaintext = enc.encode("the dispute evidence");
  const bundle = await claimantEncrypt(plaintext, op.pk);
  expect([...(await operatorDecrypt(bundle, op.sk))]).toEqual([...plaintext]);
});

test("ECIES ingest: bundle fields are well-formed", async () => {
  const bundle = await claimantEncrypt(enc.encode("x"), edPair().pk);
  expect(bundle.claimant_ephem_pub.length).toBe(32);
  expect(bundle.plaintext_hash.length).toBe(32);
  expect(bundle.ct.length).toBeGreaterThan(12 + 16);
  expect(bundle.wrapped.length).toBe(12 + 32 + 16); // wraps a 32-byte DEK
});

test("ECIES ingest: plaintext_hash == sha256(plaintext)", async () => {
  const op = edPair();
  const plaintext = enc.encode("hashed evidence");
  const bundle = await claimantEncrypt(plaintext, op.pk);
  expect([...bundle.plaintext_hash]).toEqual([...(await sha256(plaintext))]);
});

test("ECIES ingest: a different operator secret cannot decrypt", async () => {
  const op = edPair();
  const bundle = await claimantEncrypt(enc.encode("payload"), op.pk);
  await expect(operatorDecrypt(bundle, edPair().sk)).rejects.toThrow();
});

test("ECIES deliver: operator re-encrypt -> juror decrypt round-trip", async () => {
  const juror = edPair();
  const plaintext = enc.encode("for the drawn juror");
  const delivered = await deliverToJuror(plaintext, juror.pk);
  expect([...(await jurorDecrypt(delivered, juror.sk))]).toEqual([...plaintext]);
});

// ---------------------------------------------------------------------------
// DoD property: ONLY the juror's Ed25519 secret decrypts a delivered bundle
// ---------------------------------------------------------------------------

test("PROPERTY: only the juror secret decrypts; every stranger key fails", async () => {
  const juror = edPair();
  const delivered = await deliverToJuror(enc.encode("juror-only"), juror.pk);
  // the real juror succeeds
  expect([...(await jurorDecrypt(delivered, juror.sk))]).toEqual([...enc.encode("juror-only")]);
  // a crowd of strangers all fail
  for (let i = 0; i < 8; i++) {
    await expect(jurorDecrypt(delivered, edPair().sk), `stranger #${i}`).rejects.toThrow();
  }
});

test("PROPERTY: each delivery uses a fresh ephemeral key (out bytes differ, plaintext same)", async () => {
  const juror = edPair();
  const plaintext = enc.encode("replay-safe");
  const d1 = await deliverToJuror(plaintext, juror.pk);
  const d2 = await deliverToJuror(plaintext, juror.pk);
  expect([...d1.out]).not.toEqual([...d2.out]);
  expect([...d1.operator_ephem_pub]).not.toEqual([...d2.operator_ephem_pub]);
  // both still decrypt to the same plaintext
  expect([...(await jurorDecrypt(d1, juror.sk))]).toEqual([...plaintext]);
  expect([...(await jurorDecrypt(d2, juror.sk))]).toEqual([...plaintext]);
});

// ---------------------------------------------------------------------------
// Integrity gate
// ---------------------------------------------------------------------------

test("integrity gate accepts the correct hash and rejects tampering", async () => {
  const op = edPair();
  const plaintext = enc.encode("genuine");
  const bundle = await claimantEncrypt(plaintext, op.pk);
  await expect(verifyIntegrity(plaintext, bundle.plaintext_hash)).resolves.toBeUndefined();
  await expect(verifyIntegrity(enc.encode("forged"), bundle.plaintext_hash)).rejects.toThrow();
  await expect(verifyIntegrity(plaintext, rnd32())).rejects.toThrow();
});

// ---------------------------------------------------------------------------
// EnvKeyring map correctness + runtime operator resolution
// ---------------------------------------------------------------------------

test("EnvKeyring maps each base58 secret to the pubkey derived from it", async () => {
  const a = edPair();
  const b = edPair();
  const kr = EnvKeyring.fromEnv(`${bs58.encode(a.sk)},${bs58.encode(b.sk)}`);
  expect(kr.size).toBe(2);
  const ra = await kr.forOperator(a.pk);
  const rb = await kr.forOperator(b.pk);
  expect(ra).not.toBeNull();
  expect(rb).not.toBeNull();
  expect([...ra!.publicKey]).toEqual([...a.pk]);
  expect([...ra!.secretKey]).toEqual([...a.sk]);
  expect([...rb!.secretKey]).toEqual([...b.sk]);
});

test("EnvKeyring runtime resolution: cross-checks against the on-chain evidence_operator field", async () => {
  // the daemon reads Subaccord.evidence_operator on-chain; EnvKeyring must resolve
  // exactly that pubkey to the secret, and reject any other.
  const op = edPair();
  const kr = EnvKeyring.fromEnv(bs58.encode(op.sk));
  const resolved = await kr.forOperator(op.pk); // op.pk stands in for the on-chain field
  expect(resolved).not.toBeNull();
  expect([...resolved!.secretKey]).toEqual([...op.sk]);
  // a different on-chain operator that this daemon does not operate -> null (-> 404)
  expect(await kr.forOperator(edPair().pk)).toBeNull();
});

test("EnvKeyring end-to-end with ECIES: stored secret decrypts a bundle encrypted to its pubkey", async () => {
  const op = edPair();
  const kr = EnvKeyring.fromEnv(bs58.encode(op.sk));
  const resolved = await kr.forOperator(op.pk);
  expect(resolved).not.toBeNull();
  const plaintext = enc.encode("keyring-driven decrypt");
  const bundle = await claimantEncrypt(plaintext, resolved!.publicKey);
  expect([...(await operatorDecrypt(bundle, resolved!.secretKey))]).toEqual([...plaintext]);
});

// ---------------------------------------------------------------------------
// Full daemon flow
// ---------------------------------------------------------------------------

test("full flow: claimant -> operator (keyring) -> integrity gate -> juror", async () => {
  const op = edPair();
  const juror = edPair();
  const kr = EnvKeyring.fromEnv(bs58.encode(op.sk));
  const plaintext = enc.encode("end-to-end evidence round-trip");

  // claimant -> operator (operator resolved via the keyring, as in the pipeline)
  const bundle = await claimantEncrypt(plaintext, op.pk);
  const opKey = await kr.forOperator(op.pk);
  expect(opKey).not.toBeNull();
  const atOperator = await operatorDecrypt(bundle, opKey!.secretKey); // in-memory only
  await verifyIntegrity(atOperator, bundle.plaintext_hash);

  // operator -> juror
  const delivered = await deliverToJuror(atOperator, juror.pk);
  const atJuror = await jurorDecrypt(delivered, juror.sk);
  await verifyIntegrity(atJuror, bundle.plaintext_hash);
  expect([...atJuror]).toEqual([...plaintext]);
});
