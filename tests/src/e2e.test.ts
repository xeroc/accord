// e2e.test.ts — the Accord green-rule sign-off (ADR-0011, ADR-0006).
//
// Proves the end-to-end evidence contract:
//   create_dispute → post_snapshot → request_vrf → draw
//   → claimant POSTs encrypted evidence to the Evidence Operator daemon
//   → drawn juror GETs from the daemon → decrypts → verifies sha256==evidence_hash.
//
// Two layers:
//   1. "evidence crypto contract" — the ECIES round-trip (claimant↔operator↔juror)
//      mirrored bit-for-bit from apps/evidence-daemon/SPEC.md § Crypto model. This
//      is the load-bearing novel contract the daemon must implement; it is pure
//      (no validator, no daemon) and RUNS in CI as the RED-but-green core. The
//      daemon's crypto/ecies + the claimant/juror sides below share one algorithm
//      — keep them in lockstep.
//   2. "green-rule sign-off vs Surfpool + daemon" — the full on-chain flow plus
//      the daemon HTTP round-trip. SKIPS (never fails) when any prerequisite is
//      absent: a reachable validator, a reachable daemon, or the magicblock VRF
//      oracle accounts. Mirrors the skip-don't-fail contract of
//      onchain-smoke.spec.ts; goes live the moment the daemon + oracle infra land.

import {
  x25519,
  ed25519,
  edwardsToMontgomeryPub,
  edwardsToMontgomeryPriv,
} from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { hkdf } from "@noble/hashes/hkdf";

// ===========================================================================
// SPEC § Crypto model — the wire contract. The daemon must match bit-for-bit.
// ===========================================================================

/** HKDF-SHA256 info labels (SPEC § Crypto model). */
const INGEST_INFO = "accord-ingest-v1";
const DELIVER_INFO = "accord-deliver-v1";

/**
 * AES-256-GCM wire format: `nonce(12) || ciphertext || tag(16)`. Web Crypto's
 * encrypt appends the 16-byte tag to the ciphertext; we prepend the 12-byte
 * random nonce so the whole blob is self-describing. The daemon's
 * crypto/symmetric MUST use this exact layout.
 */
async function aesGcmEncrypt(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ck = await subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      ck,
      data as BufferSource,
    ),
  );
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce, 0);
  out.set(ct, nonce.length);
  return out;
}

/** Decrypt the nonce-prepended wire format; throws on GCM tag failure. */
async function aesGcmDecrypt(
  key: Uint8Array,
  packed: Uint8Array,
): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  if (packed.length < 12 + 16) throw new Error("AES-GCM: ciphertext too short");
  const nonce = packed.slice(0, 12);
  const body = packed.slice(12);
  const ck = await subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  return new Uint8Array(
    await subtle.decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      ck,
      body as BufferSource,
    ),
  );
}

/** A claimant's encrypted evidence bundle (SPEC data model), ciphertext-only. */
interface EvidenceBundle {
  ct: Uint8Array; // AES-GCM(dek, plaintext)
  claimantEphemPub: Uint8Array; // X25519, 32 bytes
  wrapped: Uint8Array; // AES-GCM(k_in, dek)
  plaintextHash: Uint8Array; // sha256(plaintext) == on-chain evidence_hash
}

/** A delivered juror ciphertext (SPEC § HTTP API GET response body). */
interface DeliveredEvidence {
  out: Uint8Array; // AES-GCM(k_out, watermarked) — watermarked == plaintext in v1
  operatorEphemPub: Uint8Array; // X25519, 32 bytes
}

/** Claimant-side: encrypt plaintext to the Subaccord's evidence_operator Ed25519 pubkey. */
async function claimantEncryptEvidence(
  plaintext: Uint8Array,
  operatorEd25519Pub: Uint8Array,
): Promise<EvidenceBundle> {
  const dek = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const ct = await aesGcmEncrypt(dek, plaintext);
  const ephemSk = x25519.utils.randomPrivateKey();
  const claimantEphemPub = x25519.getPublicKey(ephemSk);
  const shared = x25519.scalarMult(
    ephemSk,
    edwardsToMontgomeryPub(operatorEd25519Pub),
  );
  const k = hkdf(sha256, shared, undefined, INGEST_INFO, 32);
  const wrapped = await aesGcmEncrypt(k, dek);
  return { ct, claimantEphemPub, wrapped, plaintextHash: sha256(plaintext) };
}

/** Operator-side (daemon ingest): decrypt the claimant bundle to plaintext, in memory. */
async function operatorDecryptBundle(
  bundle: EvidenceBundle,
  operatorEd25519Sk: Uint8Array,
): Promise<Uint8Array> {
  const opXSk = edwardsToMontgomeryPriv(operatorEd25519Sk);
  const shared = x25519.scalarMult(opXSk, bundle.claimantEphemPub);
  const k = hkdf(sha256, shared, undefined, INGEST_INFO, 32);
  const dek = await aesGcmDecrypt(k, bundle.wrapped);
  return aesGcmDecrypt(dek, bundle.ct);
}

/** Operator-side (daemon deliver): re-encrypt plaintext to a drawn juror's Ed25519 pubkey. */
async function operatorReencryptToJuror(
  plaintext: Uint8Array,
  jurorEd25519Pub: Uint8Array,
): Promise<DeliveredEvidence> {
  const ephemSk = x25519.utils.randomPrivateKey();
  const operatorEphemPub = x25519.getPublicKey(ephemSk);
  const shared = x25519.scalarMult(
    ephemSk,
    edwardsToMontgomeryPub(jurorEd25519Pub),
  );
  const k = hkdf(sha256, shared, undefined, DELIVER_INFO, 32);
  const out = await aesGcmEncrypt(k, plaintext);
  return { out, operatorEphemPub };
}

/** Juror-side: decrypt a delivered bundle with the juror's Ed25519 secret. */
async function jurorDecryptDelivered(
  delivered: DeliveredEvidence,
  jurorEd25519Sk: Uint8Array,
): Promise<Uint8Array> {
  const jXSk = edwardsToMontgomeryPriv(jurorEd25519Sk);
  const shared = x25519.scalarMult(jXSk, delivered.operatorEphemPub);
  const k = hkdf(sha256, shared, undefined, DELIVER_INFO, 32);
  return aesGcmDecrypt(k, delivered.out);
}

function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ===========================================================================
// Layer 1 — evidence crypto contract (always runs; no infra required).
// This is the always-green RED core: it pins the exact ECIES contract the
// daemon (apps/evidence-daemon) must implement, independent of chain state.
// ===========================================================================

describe("evidence crypto contract (SPEC § Crypto model)", () => {
  it("Ed25519↔X25519 + ECIES round-trip: claimant → operator → juror", async () => {
    const operator = ed25519.utils.randomPrivateKey();
    const operatorPub = ed25519.getPublicKey(operator);
    const juror = ed25519.utils.randomPrivateKey();
    const jurorPub = ed25519.getPublicKey(juror);
    const plaintext = new TextEncoder().encode(
      "evidence-body-" + Math.random().toString(36).slice(2),
    );
    const evidenceHash = sha256(plaintext);

    // 1. claimant encrypts to the on-chain evidence_operator pubkey
    const bundle = await claimantEncryptEvidence(plaintext, operatorPub);

    // 2. daemon decrypts in memory (never persists plaintext)
    const recovered = await operatorDecryptBundle(bundle, operator);
    expect(eqBytes(sha256(recovered), evidenceHash)).toBe(true);

    // 3. daemon re-encrypts to the drawn juror
    const delivered = await operatorReencryptToJuror(recovered, jurorPub);

    // 4. juror decrypts + verifies the integrity gate (ADR-0006)
    const cleartext = await jurorDecryptDelivered(delivered, juror);
    expect(eqBytes(sha256(cleartext), evidenceHash)).toBe(true);
    expect(eqBytes(cleartext, plaintext)).toBe(true);
  });

  it("a non-juror Ed25519 key cannot decrypt a delivered bundle", async () => {
    const operator = ed25519.utils.randomPrivateKey();
    const juror = ed25519.utils.randomPrivateKey();
    const other = ed25519.utils.randomPrivateKey();
    const plaintext = new TextEncoder().encode("secret");

    const bundle = await claimantEncryptEvidence(
      plaintext,
      ed25519.getPublicKey(operator),
    );
    const recovered = await operatorDecryptBundle(bundle, operator);
    const delivered = await operatorReencryptToJuror(
      recovered,
      ed25519.getPublicKey(juror),
    );

    // the real juror decrypts fine
    const ok = await jurorDecryptDelivered(delivered, juror);
    expect(eqBytes(ok, plaintext)).toBe(true);

    // any other key fails the AES-GCM auth tag
    await expect(jurorDecryptDelivered(delivered, other)).rejects.toBeDefined();
  });

  it("rejects a tampered claimant bundle at the operator integrity gate", async () => {
    const operator = ed25519.utils.randomPrivateKey();
    const bundle = await claimantEncryptEvidence(
      new TextEncoder().encode("body"),
      ed25519.getPublicKey(operator),
    );
    // flip one ciphertext byte — the AES-GCM tag must not verify
    const tampered: EvidenceBundle = { ...bundle, ct: bundle.ct.slice() };
    const last = tampered.ct.length - 1;
    tampered.ct[last] = (tampered.ct[last] ?? 0) ^ 0xff;
    await expect(
      operatorDecryptBundle(tampered, operator),
    ).rejects.toBeDefined();
  });
});

// ===========================================================================
// Layer 2 — green-rule sign-off vs Surfpool + daemon (skips without infra).
// Goes live when: (a) a validator/Surfpool is reachable, (b) the evidence
// daemon is running and healthy, (c) the magicblock VRF oracle accounts are
// configured. Until then it is an inert contract — skip, never fail.
// ===========================================================================

const RPC_URL = process.env.ACCORD_RPC_URL ?? "http://127.0.0.1:8899";
const WS_URL = process.env.ACCORD_WS_URL ?? "ws://127.0.0.1:8900";
const DAEMON_URL = process.env.EVIDENCE_DAEMON_URL ?? ""; // e.g. http://127.0.0.1:8787
// magicblock VRF oracle — external infra dependency.
const VRF_ORACLE_QUEUE = process.env.ACCORD_VRF_ORACLE_QUEUE ?? "";
const VRF_PROGRAM_IDENTITY = process.env.ACCORD_VRF_PROGRAM_IDENTITY ?? "";
// Operator Ed25519 secret (base58) shared with the daemon's EVIDENCE_KEYRING.
// If unset, one is generated and logged — the operator must configure the daemon.
const OPERATOR_SECRET_B58 = process.env.EVIDENCE_OPERATOR_SECRET ?? "";

describe("e2e: green-rule sign-off (Surfpool + evidence daemon)", () => {
  // Everything from the lazy @solana/kit / @useaccord/sdk / @solana/spl-token
  // imports is typed loosely: layer 2 cannot run until its infra exists, and
  // the loose typing mirrors onchain-smoke.spec.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any = null;
  let skipReason = "";

  beforeAll(async () => {
    if (!DAEMON_URL) {
      skipReason =
        "EVIDENCE_DAEMON_URL unset — start the daemon (apps/evidence-daemon)";
      return;
    }
    try {
      const res = await fetch(`${DAEMON_URL}/healthz`);
      if (!res.ok) {
        skipReason = `daemon /healthz returned ${res.status}`;
        return;
      }
    } catch (e) {
      skipReason = `daemon unreachable at ${DAEMON_URL}: ${(e as Error).message}`;
      return;
    }
    if (!VRF_ORACLE_QUEUE || !VRF_PROGRAM_IDENTITY) {
      skipReason =
        "ACCORD_VRF_ORACLE_QUEUE / ACCORD_VRF_PROGRAM_IDENTITY unset";
      return;
    }
    const sdk = await import("@useaccord/sdk");
    const kit = await import("@solana/kit");
    const spl = await import("@solana/spl-token");
    const rpc = kit.createSolanaRpc(RPC_URL);
    try {
      await rpc.getEpochInfo().send();
    } catch (e) {
      skipReason = `validator unreachable at ${RPC_URL}: ${(e as Error).message}`;
      return;
    }
    ctx = { sdk, kit, spl, rpc };
  }, 60_000);

  it("full flow: create_dispute → draw → juror GET → decrypt → verify evidence_hash", async () => {
    if (skipReason) return void console.warn(`[e2e] skipped: ${skipReason}`);
    const { sdk, kit, spl, rpc } = ctx;
    const {
      Accord,
      ACCORD_PROGRAM_ID,
      findJurorStakePda,
      findSnapshotPda,
      findRoundPda,
      findAccordStatePda,
      buildMst,
      resolvePanel,
      fetchDispute,
      fetchRound,
      DisputeState,
    } = sdk;
    const { lamports, address, pipe } = kit;
    const {
      TOKEN_PROGRAM_ID,
      createMint,
      getOrCreateAssociatedTokenAccount,
      mintTo,
    } = spl;
    // base58 bridge: Ed25519 pubkeys (bytes) ↔ Solana Addresses (base58 strings),
    // via @solana/kit's own codec — the canonical source, no hand-rolled duplicate.
    const b58e = (b: Uint8Array) =>
      new TextDecoder().decode(kit.getBase58Decoder().decode(b));
    const b58d = (s: string) =>
      new Uint8Array(kit.getBase58Encoder().encode(s));

    // -- keypairs: carry each Ed25519 secret alongside its kit signer ----------
    const payer = await kit.generateKeyPairSigner();
    const operatorSecret = OPERATOR_SECRET_B58
      ? b58d(OPERATOR_SECRET_B58)
      : ed25519.utils.randomPrivateKey();
    if (!OPERATOR_SECRET_B58) {
      console.warn(
        `[e2e] generated operator pubkey ${b58e(ed25519.getPublicKey(operatorSecret))} ` +
          "— configure the daemon EVIDENCE_KEYRING with its secret to operate this Subaccord",
      );
    }
    const operatorPub = ed25519.getPublicKey(operatorSecret);
    const operatorAddr = b58e(operatorPub);

    const MIN_STAKE = 1_000n;
    const JUROR_COUNT = 4; // > panel(3) so the draw can pick a distinct set
    const jurors: { address: string; secret: Uint8Array }[] = [];
    for (let i = 0; i < JUROR_COUNT; i++) {
      const secret = ed25519.utils.randomPrivateKey();
      const signer = await kit.createKeyPairSignerFromBytes(secret);
      jurors.push({ address: signer.address, secret });
    }

    const accord = new Accord({ endpoint: RPC_URL, signer: payer });
    const rpcSubscriptions = kit.createSolanaRpcSubscriptions(WS_URL);
    const sendAndConfirm = kit.sendAndConfirmTransactionFactory({
      rpc,
      rpcSubscriptions,
    });

    await rpc.requestAirdrop(payer.address, lamports(BigInt(5e9))).send();
    await new Promise((r) => setTimeout(r, 500));

    async function sendIx(...ixs: unknown[]) {
      const { value: bh } = await rpc.getLatestBlockhash().send();
      const msg = pipe(
        kit.createTransactionMessage({ version: 0 }),
        (tx: unknown) => kit.setTransactionMessageFeePayerSigner(payer, tx),
        (tx: unknown) =>
          kit.setTransactionMessageLifetimeUsingBlockhash(bh, tx),
        (tx: unknown) => kit.appendTransactionMessageInstructions(ixs, tx),
      );
      const signed = await kit.signTransactionMessageWithSigners(msg);
      kit.assertIsTransactionWithBlockhashLifetime(signed);
      await sendAndConfirm(signed, { commitment: "confirmed" });
    }

    // -- staking token mint + helpers ---------------------------------------
    const stakingToken = await createMint(
      rpc,
      payer,
      payer.address,
      null,
      6,
      undefined,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );
    const ataFor = (owner: string) =>
      getOrCreateAssociatedTokenAccount(rpc, payer, stakingToken, owner, {
        programId: TOKEN_PROGRAM_ID,
      }).then((r: { address: string }) => r.address);

    // -- create Subaccord (evidence_operator = operator) ---------------------
    const { instruction: createSubIx, subaccord } =
      await accord.methods.createSubaccord(payer.address, {
        domainRef: crypto.getRandomValues(new Uint8Array(32)),
        evidenceSpec: crypto.getRandomValues(new Uint8Array(32)),
        stakingToken,
        minStake: MIN_STAKE,
        alphaBps: 1_000,
        reviewWindow: 604_800n,
        commitWindow: 172_800n,
        revealWindow: 172_800n,
        maxAppeals: 3,
        minJurySize: 3,
        aggregation: sdk.Aggregation.Plurality,
        feePerJuror: 0n,
        authority: address("11111111111111111111111111111111"), // Pubkey::default → immutable
        evidenceOperator: address(operatorAddr),
      });
    await sendIx(createSubIx);

    const vault = await ataFor(subaccord);
    const accordState = (await findAccordStatePda(ACCORD_PROGRAM_ID)).address;

    // -- stake jurors --------------------------------------------------------
    for (const juror of jurors) {
      const signer = await kit.createKeyPairSignerFromBytes(juror.secret);
      const jurorAta = await ataFor(juror.address);
      await mintTo(
        rpc,
        payer,
        stakingToken,
        jurorAta,
        payer,
        MIN_STAKE * 4n,
        [],
        {
          programId: TOKEN_PROGRAM_ID,
        },
      );
      const jurorStake = (
        await findJurorStakePda(ACCORD_PROGRAM_ID, subaccord, juror.address)
      ).address;
      const stakeIx = accord.methods.stake(
        {
          juror: signer,
          subaccord,
          accordState,
          jurorStake,
          stakingToken,
          jurorTokenAccount: jurorAta,
          vault,
        },
        MIN_STAKE,
      );
      // stake requires the juror signature; collect it as an extra signer.
      const { value: bh } = await rpc.getLatestBlockhash().send();
      const msg = pipe(
        kit.createTransactionMessage({ version: 0 }),
        (tx: unknown) => kit.setTransactionMessageFeePayerSigner(payer, tx),
        (tx: unknown) =>
          kit.setTransactionMessageLifetimeUsingBlockhash(bh, tx),
        (tx: unknown) =>
          kit.appendTransactionMessageInstructions([stakeIx], tx),
      );
      const signed = await kit.signTransactionMessageWithSigners(msg);
      kit.assertIsTransactionWithBlockhashLifetime(signed);
      await sendAndConfirm(signed, { commitment: "confirmed" });
    }

    // -- create_dispute (evidence_hash = sha256(plaintext)) ------------------
    const plaintext = new TextEncoder().encode(
      "evidence-for-dispute-" + Math.random().toString(36).slice(2),
    );
    const evidenceHash = sha256(plaintext);
    const filerAta = await ataFor(payer.address);
    const { instruction: createDispIx, dispute } =
      await accord.methods.createDispute(
        {
          filer: payer.address,
          subaccord,
          stakingToken,
          filerTokenAccount: filerAta,
          vault,
          accordState,
        },
        {
          options: [
            crypto.getRandomValues(new Uint8Array(32)),
            crypto.getRandomValues(new Uint8Array(32)),
          ],
          evidenceHash,
          nonce: BigInt(Date.now()),
          fee: 0n,
        },
      );
    await sendIx(createDispIx);

    // -- post_snapshot (build MST over the staked juror set) -----------------
    const tree = await buildMst(
      jurors.map((j) => ({ juror: b58d(j.address), stake: MIN_STAKE })),
    );
    const roundIdx = 0;
    const snapshot = (
      await findSnapshotPda(ACCORD_PROGRAM_ID, dispute, roundIdx)
    ).address;
    await sendIx(
      accord.methods.postSnapshot(
        {
          signer: payer.address,
          subaccord,
          dispute,
          snapshot,
          stakingToken,
          vault,
          posterTokenAccount: filerAta,
        },
        { rootHash: tree.rootHash, rootSum: tree.rootSum },
      ),
    );

    // -- request_vrf → await committed_vrf → resolve panel → draw ------------
    const vrfAccounts = { caller: payer.address, subaccord, dispute, snapshot };
    await sendIx(
      accord.methods.requestVrf(vrfAccounts, {
        oracleQueue: address(VRF_ORACLE_QUEUE),
        programIdentity: address(VRF_PROGRAM_IDENTITY),
      }),
    );
    const committedVrf = await accord.methods.awaitCommittedVrf(dispute, {
      timeoutMs: 60_000,
    });

    const { drawAttempt, memberships } = await resolvePanel(
      committedVrf,
      b58d(dispute),
      roundIdx,
      3,
      tree,
    );
    const roundPda = (await findRoundPda(ACCORD_PROGRAM_ID, dispute, roundIdx))
      .address;
    const jurorStakeAccounts = await Promise.all(
      memberships.map(
        async (m: { leaf: { juror: Uint8Array } }) =>
          (
            await findJurorStakePda(
              ACCORD_PROGRAM_ID,
              subaccord,
              b58e(m.leaf.juror),
            )
          ).address,
      ),
    );
    await sendIx(
      accord.methods.draw(
        vrfAccounts,
        roundPda,
        drawAttempt,
        memberships,
        jurorStakeAccounts,
      ),
    );

    // confirm the dispute advanced to Drawn; read the authoritative juror set
    const disputeAcc = await fetchDispute(accord.rpc, dispute);
    expect(disputeAcc).not.toBeNull();
    expect(disputeAcc.state as number).toBeGreaterThanOrEqual(
      DisputeState.Drawn as number,
    );
    const round = await fetchRound(accord.rpc, roundPda);
    expect(round).not.toBeNull();
    const ZERO = address("11111111111111111111111111111111");
    const drawn = (round.jurors as string[]).filter((j) => j !== ZERO);
    expect(drawn.length).toBeGreaterThanOrEqual(1);

    // -- claimant POSTs encrypted evidence to the daemon --------------------
    const bundle = await claimantEncryptEvidence(plaintext, operatorPub);
    const postRes = await fetch(
      `${DAEMON_URL}/evidence/${subaccord}/${dispute}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ct: Buffer.from(bundle.ct).toString("base64"),
          claimant_ephem_pub: Buffer.from(bundle.claimantEphemPub).toString(
            "base64",
          ),
          wrapped: Buffer.from(bundle.wrapped).toString("base64"),
          plaintext_hash: Buffer.from(bundle.plaintextHash).toString("base64"),
          ingested_at: Date.now(),
        }),
      },
    );
    expect([200, 201, 409].includes(postRes.status)).toBe(true); // 409 = idempotent re-post

    // -- drawn juror GETs + decrypts → GREEN RULE ---------------------------
    const drawnJuror = drawn[0]!;
    const getRes = await fetch(
      `${DAEMON_URL}/evidence/${dispute}/for/${drawnJuror}`,
    );
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      out: string;
      operator_ephem_pub: string;
    };
    const delivered: DeliveredEvidence = {
      out: new Uint8Array(Buffer.from(body.out, "base64")),
      operatorEphemPub: new Uint8Array(
        Buffer.from(body.operator_ephem_pub, "base64"),
      ),
    };
    const jurorSecret = jurors.find((j) => j.address === drawnJuror)?.secret;
    expect(jurorSecret).toBeDefined();
    const cleartext = await jurorDecryptDelivered(delivered, jurorSecret!);

    // GREEN RULE: sha256(decrypted) == on-chain evidence_hash
    expect(eqBytes(sha256(cleartext), evidenceHash)).toBe(true);
    expect(eqBytes(cleartext, plaintext)).toBe(true);
  }, 180_000);
});
