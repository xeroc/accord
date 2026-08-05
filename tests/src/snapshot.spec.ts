// snapshot.spec.ts — `post_snapshot` / `challenge_snapshot` / `finalize_snapshot`
// e2e against Surfpool (port 8903).
//
// Ports programs/accord/tests/snapshot_litesvm.rs: bond custody at post, the
// 1-day challenge window (Clock warp), the duplicate-Juror Merkle fraud proof
// (voids + pays challenger), and permissionless finalize after the window
// (returns the poster bond).
//
// Multi-signer note: the adapter binds every signing role to `accord.signer`,
// so poster/challenge instructions are built through per-role `Accord` facades
// and sent via the shared `env.sendIx` (which signs with the fee payer + every
// TransactionSigner referenced by the instruction metas).
import {
  Accord,
  createSubaccord,
  initializePause,
  createDispute,
  requiredFee,
  stake,
  buildMst,
  postSnapshot,
  challengeSnapshot,
  finalizeSnapshot,
  leafHash,
  findSnapshotPda,
  findJurorStakePda,
  getSnapshotDecoder,
  getDisputeDecoder,
  getPauseStateDecoder,
  maxAppealPanelSize,
  SNAPSHOT_CHALLENGE_WINDOW_SECS,
} from "@accord/sdk";
import {
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { createMint, setTokenBalance, TOKEN_PROGRAM_ID } from "./setup/tokens.js";
import { readClock, warpForwardSeconds } from "./setup/cheats.js";
import { defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import { expectAccordAccount, fetchDecoded } from "./setup/assertions.js";

// SnapshotStatus enum (state.rs): Posted=0, Finalized=1, Voided=2.
const SS_POSTED = 0;
const SS_FINALIZED = 1;
const SS_VOIDED = 2;
// DisputeState enum: Created=0, SnapshotPosted=1, …
const DS_SNAPSHOT_POSTED = 1;

const JURORS_PER_DISPUTE = 3;
const FEE_PER_JUROR = 1_000_000n;
const STAKE_AMOUNT = 5_000n;
const EXPECTED_BOND =
  BigInt(maxAppealPanelSize(JURORS_PER_DISPUTE, 3)) * FEE_PER_JUROR; // 31 * 1e6
const DISPUTE_FEE = requiredFee(JURORS_PER_DISPUTE, FEE_PER_JUROR)!; // 3e6

const ADDR_ENC = () => getAddressEncoder();
const ATA_PROGRAM =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/** Derive the SPL associated token account for (mint, owner). Matches the
 *  on-chain `get_associated_token_address` (seeds: [owner, token_program, mint]). */
async function ataOf(mint: Address, owner: Address): Promise<Address> {
  const e = ADDR_ENC();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM,
    seeds: [e.encode(owner), e.encode(TOKEN_PROGRAM_ID), e.encode(mint)],
  });
  return addr;
}

/** Read a token account's raw u64 amount (offset 64 of the SPL layout). */
async function tokenAmount(env: TestEnv, ata: Address): Promise<bigint> {
  const acc = await env.rpc.getAccountInfo(ata, { encoding: "base64" }).send();
  if (!acc.value) return 0n;
  const buf = Buffer.from(acc.value.data[0], "base64");
  if (buf.length < 72) return 0n;
  return buf.readBigUInt64LE(64);
}

/** Warp forward to an absolute unix timestamp (no-op if already past it). */
async function warpTo(env: TestEnv, targetTs: bigint): Promise<void> {
  const now = (await readClock(env)).unixTimestamp;
  if (targetTs > now) await warpForwardSeconds(env, Number(targetTs - now));
}

const encBytes = (a: Address) => new Uint8Array(ADDR_ENC().encode(a));

// --- local Merkle-Sum Tree for the FRAUD tree (allows duplicate jurors, which
//     the canonical `buildMst` rejects). Matches the on-chain verifier exactly:
//     leaf = sha256(juror ‖ stake_le ‖ cum_after_le), parent = sha256(L ‖ R). ---
async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  let len = 0;
  for (const p of parts) len += p.length;
  const buf = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buf));
}

interface FraudLeaf {
  juror: Address;
  jurorBytes: Uint8Array;
  stake: bigint;
  cumAfter: bigint;
}

interface FraudLevel {
  hash: Uint8Array;
  sum: bigint;
}

async function buildFraudMst(claims: FraudLeaf[]): Promise<{
  levels: FraudLevel[][];
  rootHash: Uint8Array;
  rootSum: bigint;
}> {
  const leaves: FraudLevel[] = [];
  for (const c of claims) {
    leaves.push({
      hash: await leafHash({
        juror: c.jurorBytes,
        stake: c.stake,
        cumAfter: c.cumAfter,
      }),
      sum: c.stake,
    });
  }
  let size = 1;
  while (size < leaves.length) size *= 2;
  while (leaves.length < size) leaves.push({ hash: new Uint8Array(32), sum: 0n });
  const levels: FraudLevel[][] = [leaves];
  while (levels[levels.length - 1]!.length > 1) {
    const cur = levels[levels.length - 1]!;
    const next: FraudLevel[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push({
        hash: await sha256(cur[i]!.hash, cur[i + 1]!.hash),
        sum: cur[i]!.sum + cur[i + 1]!.sum,
      });
    }
    levels.push(next);
  }
  const root = levels[levels.length - 1]![0]!;
  return { levels, rootHash: root.hash, rootSum: root.sum };
}

function fraudProof(levels: FraudLevel[][], idx: number) {
  const proof: { siblingHash: Uint8Array; siblingSum: bigint }[] = [];
  let i = idx;
  for (let d = 0; d < levels.length - 1; d++) {
    const sib = levels[d]![i ^ 1]!;
    proof.push({ siblingHash: sib.hash, siblingSum: sib.sum });
    i >>= 1;
  }
  return proof;
}

interface JurorRow {
  signer: KeyPairSigner;
  bytes: Uint8Array;
  stakePda: Address;
}

interface Ctx {
  up: boolean;
  rpcUrl: string;
  programId: Address;
  mint: Address;
  subaccord: Address;
  vault: Address;
  jurors: JurorRow[];
  tree: { rootHash: Uint8Array; rootSum: bigint };
  dispute1: Address;
  dispute2: Address;
  snapshot1: Address;
  snapshot2: Address;
  poster: KeyPairSigner;
  posterAta: Address;
  challenger: KeyPairSigner;
  challengerAta: Address;
  fraud: { levels: FraudLevel[][]; rootHash: Uint8Array; rootSum: bigint };
  ja: Address;
}

let env: TestEnv;
let ctx: Ctx;

describe("e2e: snapshot trust (requires Surfpool on :8903)", () => {
  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;

    // 1. PauseState singleton (gates stake/create_dispute).
    const pause = await initializePause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
    );
    if (!(await fetchDecoded(env, pause.pauseState, getPauseStateDecoder()))) {
      await env.sendIx(pause.instruction);
    }

    // 2. Staking mint + Subaccord (fee_per_juror = 1e6 ⇒ bond = 31e6).
    const { mint } = await createMint(env, 6);
    const args = defaultSubaccordArgs(mint, env.payer.address, {
      feePerJuror: FEE_PER_JUROR,
    });
    const sub = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    await env.sendIx(sub.instruction);
    const subaccord = sub.subaccord;
    const vault = await ataOf(mint, subaccord);

    // 3. Stake JURORS_PER_DISPUTE jurors (the juror funds JurorStake + vault rent).
    const jurors: JurorRow[] = [];
    for (let i = 0; i < JURORS_PER_DISPUTE; i++) {
      const signer = await fundSigner(env);
      const jurorAta = await ataOf(mint, signer.address);
      await setTokenBalance(env, signer.address, mint, 10_000n);
      const [stakePdaAddr] = await findJurorStakePda({
        subaccord,
        juror: signer.address,
      });
      const jurorAccord = new Accord({ endpoint: env.rpcUrl, signer });
      await env.sendIx(
        stake(
          jurorAccord.adapter,
          env.programId,
          {
            juror: signer.address,
            subaccord,
            pauseState: pause.pauseState,
            jurorStake: stakePdaAddr,
            stakingToken: mint,
            jurorTokenAccount: jurorAta,
            vault,
          },
          STAKE_AMOUNT,
        ),
      );
      jurors.push({ signer, bytes: encBytes(signer.address), stakePda: stakePdaAddr });
    }

    // 4. Canonical MST over the juror set (sorted, sentinel-padded).
    const tree = await buildMst(
      jurors.map((j) => ({ juror: j.bytes, stake: STAKE_AMOUNT })),
    );

    // 5. Fund the filer (= payer) and file two disputes (nonce 1, 2).
    const filerAta = await ataOf(mint, env.payer.address);
    await setTokenBalance(env, env.payer.address, mint, DISPUTE_FEE * 5n);
    const evidenceHash = randomBytes32();
    const options = [randomBytes32(), randomBytes32()];
    const mkDispute = async (nonce: bigint) => {
      const r = await createDispute(
        env.accord.adapter,
        {
          filer: env.payer.address,
          subaccord,
          stakingToken: mint,
          filerTokenAccount: filerAta,
          vault,
          pauseState: pause.pauseState,
        },
        { options, evidenceHash, nonce, fee: DISPUTE_FEE },
        env.programId,
      );
      await env.sendIx(r.instruction);
      return r.dispute;
    };
    const nonce1 = (() => {
      const b = randomBytes32();
      return new DataView(b.buffer).getBigUint64(0, true);
    })();
    const dispute1 = await mkDispute(nonce1);
    const dispute2 = await mkDispute(nonce1 + 1n);

    // 6. Fund poster + challenger (separate signers + ATAs).
    const poster = await fundSigner(env);
    const challenger = await fundSigner(env);
    const posterAta = await ataOf(mint, poster.address);
    const challengerAta = await ataOf(mint, challenger.address);
    await setTokenBalance(env, poster.address, mint, EXPECTED_BOND * 5n);
    await setTokenBalance(env, challenger.address, mint, EXPECTED_BOND * 5n);

    // 7. Snapshot PDAs (round 0 per dispute).
    const [snapshot1] = await findSnapshotPda({ dispute: dispute1, roundIdx: 0 });
    const [snapshot2] = await findSnapshotPda({ dispute: dispute2, roundIdx: 0 });

    // 8. Fraud tree: JA duplicated at index 0 (stake 100) and index 2 (stake 300).
    const ja = await generateKeyPairSigner();
    const jb = await generateKeyPairSigner();
    const jc = await generateKeyPairSigner();
    const fraud = await buildFraudMst([
      { juror: ja.address, jurorBytes: encBytes(ja.address), stake: 100n, cumAfter: 100n },
      { juror: jb.address, jurorBytes: encBytes(jb.address), stake: 200n, cumAfter: 300n },
      { juror: ja.address, jurorBytes: encBytes(ja.address), stake: 300n, cumAfter: 600n },
      { juror: jc.address, jurorBytes: encBytes(jc.address), stake: 400n, cumAfter: 1000n },
    ]);

    ctx = {
      up: true,
      rpcUrl: env.rpcUrl,
      programId: env.programId,
      mint,
      subaccord,
      vault,
      jurors,
      tree,
      dispute1,
      dispute2,
      snapshot1,
      snapshot2,
      poster,
      posterAta,
      challenger,
      challengerAta,
      fraud,
      ja: ja.address,
    };
  }, 120_000);

  it("posts a snapshot: bonds stake, marks Posted, advances dispute", async () => {
    if (!ctx.up) return;
    const posterAccord = new Accord({ endpoint: ctx.rpcUrl, signer: ctx.poster });
    const accounts = {
      signer: ctx.poster.address,
      subaccord: ctx.subaccord,
      dispute: ctx.dispute1,
      snapshot: ctx.snapshot1,
      stakingToken: ctx.mint,
      vault: ctx.vault,
      posterTokenAccount: ctx.posterAta,
    };
    const posterBefore = await tokenAmount(env, ctx.posterAta);
    const tsBefore = (await readClock(env)).unixTimestamp;

    await env.sendIx(
      postSnapshot(posterAccord.adapter, ctx.programId, accounts, {
        rootHash: ctx.tree.rootHash,
        rootSum: ctx.tree.rootSum,
      }),
    );
    await expectAccordAccount(env, ctx.snapshot1);

    const snap = (await fetchDecoded(env, ctx.snapshot1, getSnapshotDecoder()))!;
    expect(snap.status).toBe(SS_POSTED);
    expect(snap.poster).toBe(ctx.poster.address);
    expect(snap.bond).toBe(EXPECTED_BOND);
    expect(snap.totalStake).toBe(ctx.tree.rootSum);
    expect(snap.challengeDeadline).toBe(
      tsBefore + BigInt(SNAPSHOT_CHALLENGE_WINDOW_SECS),
    );
    // bond custody: poster ATA lost EXPECTED_BOND into the vault.
    expect(await tokenAmount(env, ctx.posterAta)).toBe(posterBefore - EXPECTED_BOND);

    const dispute = (await fetchDecoded(env, ctx.dispute1, getDisputeDecoder()))!;
    expect(Number(dispute.state)).toBe(DS_SNAPSHOT_POSTED);
  }, 60_000);

  it("voids a fraudulent snapshot via a Duplicate-juror challenge", async () => {
    if (!ctx.up) return;
    // Post the FRAUD root (JA duplicated) on dispute2.
    const posterAccord = new Accord({ endpoint: ctx.rpcUrl, signer: ctx.poster });
    const accounts = {
      signer: ctx.poster.address,
      subaccord: ctx.subaccord,
      dispute: ctx.dispute2,
      snapshot: ctx.snapshot2,
      stakingToken: ctx.mint,
      vault: ctx.vault,
      posterTokenAccount: ctx.posterAta,
    };
    await env.sendIx(
      postSnapshot(posterAccord.adapter, ctx.programId, accounts, {
        rootHash: ctx.fraud.rootHash,
        rootSum: ctx.fraud.rootSum,
      }),
    );

    // Challenge within the window with a Duplicate proof (JA @ idx 0 and 2).
    const challengerAccord = new Accord({
      endpoint: ctx.rpcUrl,
      signer: ctx.challenger,
    });
    const chalBefore = await tokenAmount(env, ctx.challengerAta);
    const proof = {
      __kind: "Duplicate" as const,
      leafA: { juror: ctx.ja, stake: 100n, cumAfter: 100n },
      proofA: fraudProof(ctx.fraud.levels, 0),
      indexA: 0,
      leafB: { juror: ctx.ja, stake: 300n, cumAfter: 600n },
      proofB: fraudProof(ctx.fraud.levels, 2),
      indexB: 2,
    };
    await env.sendIx(
      challengeSnapshot(
        challengerAccord.adapter,
        ctx.programId,
        accounts,
        ctx.challengerAta,
        proof,
      ),
    );

    const snap = (await fetchDecoded(env, ctx.snapshot2, getSnapshotDecoder()))!;
    expect(snap.status).toBe(SS_VOIDED);
    // Challenger nets +EXPECTED_BOND (forfeited poster bond).
    expect(await tokenAmount(env, ctx.challengerAta)).toBe(
      chalBefore + EXPECTED_BOND,
    );
  }, 60_000);

  it("finalizes an unchallenged snapshot after the challenge window", async () => {
    if (!ctx.up) return;
    // snapshot1 is Posted + unchallenged. Wait out the 1-day window.
    const snap = (await fetchDecoded(env, ctx.snapshot1, getSnapshotDecoder()))!;
    await warpTo(env, snap.challengeDeadline + 1n);
    const posterBefore = await tokenAmount(env, ctx.posterAta);

    // Permissionless crank — payer signs via env.accord.adapter.
    const accounts = {
      signer: env.payer.address,
      subaccord: ctx.subaccord,
      dispute: ctx.dispute1,
      snapshot: ctx.snapshot1,
      stakingToken: ctx.mint,
      vault: ctx.vault,
      posterTokenAccount: ctx.posterAta,
    };
    await env.sendIx(finalizeSnapshot(env.accord.adapter, ctx.programId, accounts));

    const finalized = (await fetchDecoded(env, ctx.snapshot1, getSnapshotDecoder()))!;
    expect(finalized.status).toBe(SS_FINALIZED);
    // Poster bond returned after an unchallenged window.
    expect(await tokenAmount(env, ctx.posterAta)).toBe(
      posterBefore + EXPECTED_BOND,
    );
  }, 60_000);
});
