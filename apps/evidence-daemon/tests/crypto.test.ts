/**
 * crypto.test.ts — daemon-level crypto integration (accord-c07y).
 *
 * The pure primitive / round-trip suites moved to `@accord/sdk/evidence` with
 * the protocol (ADR-0006); this file keeps the two daemon-level integration
 * proofs that exercise EnvKeyring ↔ the SDK protocol together:
 *   - the stored operator secret decrypts a bundle encrypted to its pubkey;
 *   - the full claimant → operator(keyring) → integrity gate → juror flow.
 *
 * Authority: apps/evidence-daemon/SPEC.md §Testing strategy.
 */
import { test, expect } from "bun:test";
import bs58 from "bs58";
import {
  claimantEncrypt,
  deliverToJuror,
  ed25519PublicKeyFromSeed,
  jurorDecrypt,
  operatorDecrypt,
  verifyIntegrity,
} from "@accord/sdk/evidence";
import { EnvKeyring } from "../src/keys/keyring";

const enc = new TextEncoder();
const rnd32 = () => crypto.getRandomValues(new Uint8Array(32));
const edPair = () => {
  const sk = rnd32();
  return { sk, pk: ed25519PublicKeyFromSeed(sk) };
};

test("EnvKeyring end-to-end with ECIES: stored secret decrypts a bundle encrypted to its pubkey", async () => {
  const op = edPair();
  const kr = EnvKeyring.fromEnv(bs58.encode(op.sk));
  const resolved = await kr.forOperator(op.pk);
  expect(resolved).not.toBeNull();
  const plaintext = enc.encode("keyring-driven decrypt");
  const bundle = await claimantEncrypt(plaintext, resolved!.publicKey);
  expect([...(await operatorDecrypt(bundle, resolved!.secretKey))]).toEqual([...plaintext]);
});

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
