// attestation.spec.ts — Attestation-gated Subaccords (PROG-ATTESTTION) e2e.
//
// The LiteSVM suite (programs/accord/tests/attestation_litesvm.rs, 13 cases)
// proves the on-chain gate matrix exhaustively. This spec is the integration
// sign-off: it drives the NEW paths (gated stake with a SAS attestation, the
// prune_juror crank) through the @useaccord/sdk facade against a live Surfpool,
// with a fabricated SAS attestation account injected via the surfnet cheatcode.
//
// Coverage:
//  - gated stake w/ valid SAS attestation  → JurorStake credited, gate passes
//  - gated stake w/o attestation           → reverts (AttestationMissing)
//  - prune_juror on an expired credential   → leaf zeroed, pending_withdrawal banked
//
// Attestation is OPTIONAL: a stake-only Subaccord (both fields default) ignores
// the gate — that back-compat is covered by every other e2e spec (staking, draw,
// appeal, full-lifecycle) which all pass unchanged against this program.
import {
  Accord,
  stake,
  pruneJuror,
  createSubaccord,
  initializePause,
  getJurorStakeDecoder,
  getSubaccordDecoder,
  buildAccumulator,
  proofFor,
  emptyRoot,
  type StakingAccounts,
  type PruneJurorAccounts,
  type MerkleAccumulator,
  type MSTNode,
} from "@useaccord/sdk";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { readClock, setAccountRaw, warpForwardSeconds } from "./setup/cheats.js";
import {
  createMint,
  setTokenBalance,
  TOKEN_PROGRAM_ID,
} from "./setup/tokens.js";
import { defaultSubaccordArgs } from "./setup/fixtures.js";
import { fetchDecoded } from "./setup/assertions.js";

/** SPL Associated Token Account program (`ATokenGPvbd…`). */
const ATA_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
/** SAS (Solana Attestation Service) program — owner of attestation accounts. */
const SAS_PROGRAM_ID =
  "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG" as Address;
/** JurorStake PDA seed prefix (state.rs: SEED_JUROR_STAKE = b"stake"). */
const SEED_JUROR_STAKE = new Uint8Array([115, 116, 97, 107, 101]); // "stake"

const STAKE_FUND = 10_000n;
const STAKE_AMT = 5_000n;
const DEPTH = 4;

function addrBytes(a: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(a));
}

/** Derive the canonical ATA for (mint, owner). */
async function ata(mint: Address, owner: Address): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM_ID,
    seeds: [
      new Uint8Array(enc.encode(owner)),
      new Uint8Array(enc.encode(TOKEN_PROGRAM_ID)),
      new Uint8Array(enc.encode(mint)),
    ],
  });
  return addr;
}

/** Derive the JurorStake PDA (`["stake", subaccord, juror]`). */
async function jurorStakePda(
  programId: Address,
  subaccord: Address,
  juror: Address,
): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      SEED_JUROR_STAKE,
      new Uint8Array(enc.encode(subaccord)),
      new Uint8Array(enc.encode(juror)),
    ],
  });
  return addr;
}

/** Derive a valid, unique address (PDA off the SAS program). Used for the
 *  credential/schema binding + the attestation account address — any valid
 *  32-byte address works (the program reads by address, never derives). */
async function deriveAddr(label: string): Promise<Address> {
  const [addr] = await getProgramDerivedAddress({
    programAddress: SAS_PROGRAM_ID,
    seeds: [new TextEncoder().encode(label)],
  });
  return addr;
}

/**
 * Build a raw SAS Attestation account body (data_len = 32 → wallet only) with
 * the confirmed variable-length layout (mirror of `sas_layout` in lib.rs):
 *   [0]=disc(2) [1..33]=nonce [33..65]=credential [65..97]=schema
 *   [97..101]=data_len(u32) [101..133]=wallet [133..165]=signer [165..173]=expiry(i64)
 * `expiry === 0` ⇒ never expires.
 */
function makeSasAttestation(
  credential: Address,
  schema: Address,
  wallet: Address,
  expirySeconds: number,
): Uint8Array {
  const enc = getAddressEncoder();
  const dataLen = 32;
  const total = 101 + dataLen + 32 + 8; // 173
  const buf = new Uint8Array(total);
  buf[0] = 2; // AttestationDiscriminator
  // [1..33] nonce — zero (program does not read it)
  buf.set(enc.encode(credential), 33);
  buf.set(enc.encode(schema), 65);
  new DataView(buf.buffer).setUint32(97, dataLen, true);
  buf.set(enc.encode(wallet), 101);
  // [133..165] signer — zero (program does not read it)
  new DataView(buf.buffer).setBigInt64(165, BigInt(expirySeconds), true);
  return buf;
}

/** Install a SAS attestation account at `addr` in the surfnet (owner = SAS). */
async function setSasAttestation(
  env: TestEnv,
  addr: Address,
  credential: Address,
  schema: Address,
  wallet: Address,
  expirySeconds: number,
): Promise<void> {
  await setAccountRaw(env, addr, {
    lamports: 1_000_000_000,
    data: makeSasAttestation(credential, schema, wallet, expirySeconds),
    owner: SAS_PROGRAM_ID,
    executable: false,
    rentEpoch: 0,
  });
}

/** Walk an error's cause chain collecting messages + program logs, without
 *  trusting any unchecked shape (no casts — `in` narrowing only). */
function errorText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  let depth = 0;
  while (cur && typeof cur === "object" && depth < 8) {
    if ("message" in cur && typeof cur.message === "string") parts.push(cur.message);
    if ("transactionLogs" in cur && Array.isArray(cur.transactionLogs)) {
      for (const line of cur.transactionLogs) if (typeof line === "string") parts.push(line);
    }
    if ("logs" in cur && Array.isArray(cur.logs)) {
      for (const line of cur.logs) if (typeof line === "string") parts.push(line);
    }
    cur = "cause" in cur ? cur.cause : undefined;
    depth++;
  }
  return parts.join("\n");
}

/** Off-chain accumulator mirror (same reference as staking.spec.ts). */
class TreeTracker {
  tree!: MerkleAccumulator;
  nextIndex = 0;
  constructor(readonly depth: number) {}
  async init() {
    this.tree = await buildAccumulator([], this.depth);
    return this;
  }
  pathForNext(): Promise<MSTNode[]> {
    return proofFor(this.tree, this.nextIndex);
  }
  pathFor(index: number): Promise<MSTNode[]> {
    return proofFor(this.tree, index);
  }
  async setLeaf(juror: Address, amount: bigint): Promise<number> {
    const index = this.nextIndex;
    const leaves = [...this.tree.leaves];
    leaves[index] = { juror: addrBytes(juror), stake: amount };
    this.tree = await buildAccumulator(leaves, this.depth);
    this.nextIndex++;
    return index;
  }
  get rootHash(): Uint8Array {
    return this.tree.rootHash;
  }
}

describe("e2e: attestation-gated Subaccords (requires Surfpool)", () => {
  let env: TestEnv;
  let programId: Address;
  let mint!: Address;
  let subaccord!: Address;
  let vault!: Address;
  let accordState!: Address;
  /** Fixed credential/schema the gated Subaccord binds to. */
  let credential!: Address;
  let schema!: Address;
  let tree!: TreeTracker;

  /** Fresh funded juror + ATA + per-juror Accord facade. */
  async function armJuror(): Promise<{
    juror: KeyPairSigner;
    jurorAta: Address;
    jurorStake: Address;
    accounts: StakingAccounts;
    facade: Accord;
  }> {
    const juror = await fundSigner(env);
    await setTokenBalance(env, juror.address, mint, STAKE_FUND);
    const jurorAta = await ata(mint, juror.address);
    const jurorStake = await jurorStakePda(programId, subaccord, juror.address);
    const accounts: StakingAccounts = {
      juror: juror.address,
      subaccord,
      accordState,
      jurorStake,
      stakingToken: mint,
      jurorTokenAccount: jurorAta,
      stakeVault: vault,
    };
    const facade = new Accord({ endpoint: env.rpcUrl, signer: juror });
    return { juror, jurorAta, jurorStake, accounts, facade };
  }

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;
    programId = env.programId;

    const pause = await initializePause(
      env.accord.adapter,
      programId,
      env.payer.address,
    );
    accordState = pause.accordState;
    const existing = await env.rpc
      .getAccountInfo(accordState, { encoding: "base64" })
      .send();
    if (!existing.value) await env.sendIx(pause.instruction);

    mint = (await createMint(env, 6)).mint;

    // A CREDENTIAL-GATED Subaccord: both jurorCredential + jurorSchema set.
    credential = await deriveAddr("credential");
    schema = await deriveAddr("schema");
    const args = defaultSubaccordArgs(mint, mint, env.payer.address, {
      depth: DEPTH,
      jurorCredential: credential,
      jurorSchema: schema,
    });
    const sub = await createSubaccord(
      env.accord.adapter,
      programId,
      env.payer.address,
      args,
    );
    subaccord = sub.subaccord;
    await env.sendIx(sub.instruction);

    vault = await ata(mint, subaccord);
    tree = await new TreeTracker(DEPTH).init();
  }, 120_000);

  it("gated stake with a valid SAS attestation credits JurorStake", async () => {
    if (!env.up) return;
    const { juror, jurorStake, accounts, facade } = await armJuror();

    // Inject a never-expiring attestation for this juror under our (cred,schema).
    const att = await deriveAddr("att-never-expire");
    await setSasAttestation(env, att, credential, schema, juror.address, 0);

    const path = await tree.pathForNext();
    await env.sendIx(
      stake(facade.adapter, programId, accounts, STAKE_AMT, path, att),
    );
    await tree.setLeaf(juror.address, STAKE_AMT);

    const js = await fetchDecoded(env, jurorStake, getJurorStakeDecoder());
    expect(js).not.toBeNull();
    expect(js!.staked).toBe(STAKE_AMT);
  }, 60_000);

  it("gated stake without an attestation reverts (AttestationMissing)", async () => {
    if (!env.up) return;
    const { accounts, facade } = await armJuror();
    const path = await tree.pathForNext();
    // No attestation ⇒ the gate fires AttestationMissing. Surfpool surfaces the
    // numeric code (#6057 = AttestationMissing, the 58th AccordError variant)
    // rather than the Anchor name; the LiteSVM suite asserts the name directly.
    let reverted = false;
    try {
      await env.sendIx(
        stake(facade.adapter, programId, accounts, STAKE_AMT, path),
      );
    } catch (e) {
      reverted = true;
      expect(errorText(e)).toMatch(/#6057\b/);
    }
    expect(reverted).toBe(true);
  }, 60_000);

  it("prune_juror evicts an expired-credential juror (leaf zeroed)", async () => {
    if (!env.up) return;
    const { juror, jurorStake, accounts, facade } = await armJuror();

    // Stake with a clock-relative expiry that clears the attestation horizon
    // ((review+commit+reveal+appeal)×(max_appeals+1) — 56 days by default).
    // Derived from the LIVE clock, not a hardcoded absolute: the surfnet clock
    // is global and a prior spec — or a prior run on a persistent surfnet — may
    // have advanced it well past any fixed timestamp (cheats.ts discipline).
    const att = await deriveAddr("att-prune");
    const { unixTimestamp: now } = await readClock(env);
    const lifetimeSecs = 365n * 24n * 60n * 60n; // 1 year >> 56-day horizon
    const farFuture = now + lifetimeSecs;
    await setSasAttestation(env, att, credential, schema, juror.address, Number(farFuture));
    const stakePath = await tree.pathForNext();
    await env.sendIx(
      stake(facade.adapter, programId, accounts, STAKE_AMT, stakePath, att),
    );
    const index = await tree.setLeaf(juror.address, STAKE_AMT);

    // Warp well past the expiry so the credential lapses, then rewrite it to a
    // concrete expired timestamp (prune requires expiry != 0 && expiry <= now).
    await warpForwardSeconds(env, lifetimeSecs + 1_000n);
    await setSasAttestation(env, att, credential, schema, juror.address, 1);

    // This suite shares the Subaccord (test 1's juror is still staked), so
    // assert the prune decrements stakerCount by exactly one — not to absolute
    // zero.
    const subBefore = await fetchDecoded(env, subaccord, getSubaccordDecoder());
    expect(subBefore).not.toBeNull();
    const countBefore = subBefore!.stakerCount;

    // Permissionless prune: a fresh cranker signs; the juror does not.
    const cranker = await fundSigner(env);
    const crankerFacade = new Accord({ endpoint: env.rpcUrl, signer: cranker });
    const pruneAccounts: PruneJurorAccounts = {
      caller: cranker.address,
      juror: juror.address,
      subaccord,
      jurorStake,
    };
    const prunePath = await tree.pathFor(index);
    await env.sendIx(
      pruneJuror(
        crankerFacade.adapter,
        programId,
        pruneAccounts,
        prunePath,
        att,
      ),
    );

    const js = await fetchDecoded(env, jurorStake, getJurorStakeDecoder());
    expect(js).not.toBeNull();
    expect(js!.staked).toBe(0n);
    expect(js!.pendingWithdrawal).toBe(STAKE_AMT);

    const sub = await fetchDecoded(env, subaccord, getSubaccordDecoder());
    expect(sub).not.toBeNull();
    expect(sub!.stakerCount).toBe(countBefore - 1);
  }, 90_000);
});
