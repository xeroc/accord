// synod-harness.ts — shared composite for the synod e2e specs (the
// draw-harness pattern: one place for the VRF-free synod setup).
//
// Arms a Synod-ready Accord court (Subaccord with `feePerJuror > 0` + the
// `staker_count >= INITIAL_NUM_JURORS` intake gate satisfied via
// `armSubaccordAndJurors`), then composes the synod lifecycle steps the four
// per-instruction specs share: open, join, file, dispute-state fabrication,
// and vault/party balance reads.
//
// Dispute states beyond `Created` are FABRICATED (decode → mutate →
// re-encode → `surfnet_setAccount`) — the draw/commit/reveal/finalize chain
// is Accord's own e2e coverage; the synod specs only need a bound dispute in
// a given terminal state. The full real chain over a Synod case is the
// full-lifecycle spec's job (accord-ipja).

import type { Address, KeyPairSigner } from "@solana/kit";
import {
  DisputeState,
  getDisputeDecoder,
  getDisputeEncoder,
  initializePause,
  requiredFee,
} from "@useaccord/sdk";
import {
  claim,
  fileDispute,
  findBoundDisputePda,
  getSynodCaseDecoder,
  join,
  openCase,
  refundRosterMiss,
  type SynodCase,
} from "@useaccord/synod";

import { fetchDecoded } from "./setup/assertions.js";
import { readClock, setAccountRaw } from "./setup/cheats.js";
import { fundSigner, type TestEnv } from "./setup/env.js";
import { ataOf, setTokenBalance } from "./setup/tokens.js";
import { randomBytes32 } from "./setup/fixtures.js";
import {
  armSubaccordAndJurors,
  type JurorCtx,
  type TreeTracker,
} from "./draw-harness.js";

/** Canonical test economics: 5 tokens/juror × 3 jurors frozen = 15. */
export const SY_FEE_PER_JUROR = 5n;
export const SY_STAKE = 1_000n;
export const SY_JOIN_WINDOW_SECS = 3_600n;

/** A fully-armed Synod court (Subaccord + staked jurors + fee mint). */
export interface SynodArm {
  env: TestEnv;
  mint: Address;
  subaccord: Address;
  /** Subaccord fee_vault ATA (Accord CPI destination for the frozen fee). */
  feeVault: Address;
  accordState: Address;
  /** `min_jury_size · fee_per_juror`, frozen at open. */
  frozenFee: bigint;
  /** The staked jury pool (DrawFixture panel) — real draw/vote chains. */
  jurors: JurorCtx[];
  tree: TreeTracker;
  jurorPdaByHex: Map<string, Address>;
}

/** A case opened on an armed court, with its roster funded. */
export interface SynodCaseFixture {
  arm: SynodArm;
  casePda: Address;
  nonce: bigint;
  parties: KeyPairSigner[];
  stake: bigint;
}

let nonceSeq = 0n;

/**
 * Arm a Synod-ready court: idempotent pause singleton, then a Subaccord with
 * `feePerJuror = SY_FEE_PER_JUROR` and enough staked jurors to pass Accord's
 * create_dispute intake gate.
 */
export async function armSynodCourt(env: TestEnv): Promise<SynodArm> {
  const pause = await initializePause(
    env.accord.adapter,
    env.programId,
    env.payer.address,
  );
  const existing = await env.rpc
    .getAccountInfo(pause.accordState, { encoding: "base64" })
    .send();
  if (!existing.value) await env.sendIx(pause.instruction);

  const armed = await armSubaccordAndJurors(env, pause.accordState, {
    feePerJuror: SY_FEE_PER_JUROR,
  });
  return {
    env,
    mint: armed.mint,
    subaccord: armed.subaccord,
    feeVault: armed.vault,
    accordState: pause.accordState,
    frozenFee: requiredFee(SY_FEE_PER_JUROR)!,
    jurors: armed.jurors,
    tree: armed.tree,
    jurorPdaByHex: armed.jurorPdaByHex,
  };
}

/** Fresh funded roster + `open_case` (roster via `fundSigner` — SOL-funded). */
export async function openSynodCase(
  arm: SynodArm,
  partyCount: number,
  opts: { stake?: bigint; joinWindowSecs?: bigint; parties?: KeyPairSigner[] } = {},
): Promise<SynodCaseFixture> {
  const parties =
    opts.parties ??
    (await Promise.all(
      Array.from({ length: partyCount }, () => fundSigner(arm.env)),
    ));

  const nonce = BigInt(Date.now()) + ++nonceSeq;
  const now = (await readClock(arm.env)).unixTimestamp;
  const { instruction, case: casePda } = await openCase(
    { opener: parties[0]!, subaccord: arm.subaccord },
    {
      parties: parties.map((p) => p.address),
      stake: opts.stake ?? SY_STAKE,
      joinDeadline: now + (opts.joinWindowSecs ?? SY_JOIN_WINDOW_SECS),
      nonce,
    },
  );
  await arm.env.sendIx(instruction);
  return { arm, casePda, nonce, parties, stake: opts.stake ?? SY_STAKE };
}

/** Fund a party's ATA and `join` the case (signer = the party itself). */
export async function joinSynodParty(
  fx: SynodCaseFixture,
  party: KeyPairSigner,
  evidence: Uint8Array = randomBytes32(),
): Promise<void> {
  const { env, mint } = fx.arm;
  await setTokenBalance(env, party.address, mint, fx.stake * 2n);
  await env.sendIx(
    await join(
      {
        party,
        case: fx.casePda,
        subaccord: fx.arm.subaccord,
        feeMint: mint,
        partyTokenAccount: await ataOf(mint, party.address),
        vault: await ataOf(mint, fx.casePda),
      },
      { evidenceHash: evidence },
    ),
  );
}

/** Convenience: open + join every party (full roster). */
export async function openFullRoster(
  arm: SynodArm,
  partyCount: number,
  opts: { stake?: bigint } = {},
): Promise<SynodCaseFixture> {
  const fx = await openSynodCase(arm, partyCount, opts);
  for (const p of fx.parties) await joinSynodParty(fx, p);
  return fx;
}

/** `file_dispute` by an arbitrary caller; returns the bound dispute PDA. */
export async function fileSynodDispute(fx: SynodCaseFixture): Promise<Address> {
  const { env, mint, subaccord, feeVault, accordState } = fx.arm;
  const [dispute] = await findBoundDisputePda(fx.casePda);
  await env.sendIx(
    await fileDispute(
      {
        caller: env.payer,
        opener: fx.parties[0]!.address,
        case: fx.casePda,
        subaccord,
        feeMint: mint,
        vault: await ataOf(mint, fx.casePda),
      },
      { nonce: fx.nonce },
      { accordDispute: dispute, accordState, accordFeeVault: feeVault },
    ),
  );
  return dispute;
}

/** Pull one party's payout through `claim` (destination ATA identifies it). */
export async function claimSynodShare(
  fx: SynodCaseFixture,
  party: KeyPairSigner,
  dispute: Address,
): Promise<void> {
  const { env, mint } = fx.arm;
  await env.sendIx(
    await claim(
      {
        caller: env.payer,
        opener: fx.parties[0]!.address,
        case: fx.casePda,
        dispute,
        subaccord: fx.arm.subaccord,
        feeMint: mint,
        partyTokenAccount: await ataOf(mint, party.address),
        vault: await ataOf(mint, fx.casePda),
      },
      { nonce: fx.nonce },
    ),
  );
}

/** Pull one joined party's `S` back after a roster miss. */
export async function refundSynodParty(
  fx: SynodCaseFixture,
  party: KeyPairSigner,
): Promise<void> {
  const { env, mint } = fx.arm;
  await env.sendIx(
    await refundRosterMiss(
      {
        caller: env.payer,
        opener: fx.parties[0]!.address,
        case: fx.casePda,
        subaccord: fx.arm.subaccord,
        feeMint: mint,
        partyTokenAccount: await ataOf(mint, party.address),
        vault: await ataOf(mint, fx.casePda),
      },
      { nonce: fx.nonce },
    ),
  );
}

/** Decode the SynodCase at `casePda` (null when absent). */
export async function readSynodCase(
  env: TestEnv,
  casePda: Address,
): Promise<SynodCase | null> {
  return fetchDecoded(env, casePda, getSynodCaseDecoder());
}

/** Token balance of any token account (vaults + party ATAs). */
export async function tokenAmount(
  env: TestEnv,
  account: Address,
): Promise<bigint> {
  const res = await env.rpc.getTokenAccountBalance(account).send();
  return BigInt(res.value.amount);
}

/**
 * Fabricate the bound dispute's terminal state (decode → mutate → re-encode →
 * `surfnet_setAccount`): `Final {finalRuling}` or `Failed`. The
 * `finalize_dispute` / `cancel_dispute` transitions are Accord's own e2e
 * coverage; the claim spec only needs the terminal state to read from.
 */
export async function forceDisputeOutcome(
  env: TestEnv,
  dispute: Address,
  outcome: { state: "Final"; ruling: bigint } | { state: "Failed" },
): Promise<void> {
  const account = await env.rpc
    .getAccountInfo(dispute, { encoding: "base64" })
    .send();
  if (!account.value) throw new Error(`dispute ${dispute} missing`);
  const bytes = new Uint8Array(Buffer.from(account.value.data[0], "base64"));
  const d = getDisputeDecoder().decode(bytes);
  if (outcome.state === "Final") {
    d.state = DisputeState.Final;
    d.finalRuling = outcome.ruling;
    d.finalizedAt = (await readClock(env)).unixTimestamp;
  } else {
    d.state = DisputeState.Failed;
  }
  await setAccountRaw(env, dispute, {
    lamports: account.value.lamports,
    data: new Uint8Array(getDisputeEncoder().encode(d)),
    owner: account.value.owner,
  });
}
