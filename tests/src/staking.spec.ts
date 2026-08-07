// staking.spec.ts — Juror capital stake / unstake against Surfpool (port of
// programs/accord/tests/stake_litesvm.rs), ADR-0012 accumulator paths.
//
// Coverage:
//  - happy stake  : SPL-transfer into the vault + JurorStake.amount credited
//                   + the on-chain accumulator root updated via the client path
//  - happy unstake: full unstake drains JurorStake.amount to 0 (path-verified)
//  - invalid amount (0) revert (SDK `InvalidAmount` guard, mirrors on-chain)
//  - over-balance unstake reverts on-chain (InsufficientBalance)
//  - canUnstake active_draws>0 guard (pure unit cases + on-chain StakeLocked)
//
// ADR-0012: every stake/unstake carries a Merkle membership `path` the program
// re-verifies against the live Subaccord root, then recomputes the new root. A
// shared off-chain TreeTracker mirrors the on-chain tree so each test can mint a
// valid path for the juror's leaf index.
//
// Multi-signer: the SDK adapter pins `juror = accord.signer`, so each juror
// gets its own `new Accord({ endpoint, signer: jurorKp })` facade; the juror
// (not the fee payer) funds JurorStake + vault-ATA rent, so it is airdropped
// SOL up front via fundSigner.
//
// Singleton: PauseState is a program-wide singleton; initializePause is only
// sent when it does not already exist, so the suite is re-runnable and
// coexists with sibling specs.
import {
  Accord,
  stake,
  requestWithdraw,
  withdraw,
  canUnstake,
  initializePause,
  createSubaccord,
  getJurorStakeDecoder,
  getSubaccordDecoder,
  buildAccumulator,
  proofFor,
  emptyRoot,
  type StakingAccounts,
  type MerkleAccumulator,
  type MSTNode,
} from "@accord/sdk";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  getAddressDecoder,
  type Address,
} from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { setAccountRaw, warpForwardSeconds } from "./setup/cheats.js";
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

/** JurorStake PDA seed prefix (state.rs: SEED_JUROR_STAKE = b"stake"). */
const SEED_JUROR_STAKE = new Uint8Array([115, 116, 97, 107, 101]); // "stake"

const FEE_PER_JUROR = 1_000_000n;
const MIN_STAKE = 1_000n;
const STAKE_FUND = 10_000n; // juror ATA balance before staking
const STAKE_AMT = 5_000n;
const DEPTH = 4;
const WITHDRAWAL_DELAY_SECS = 3 * 24 * 60 * 60; // constants.rs: PRE_DRAW_CANCEL_TIMEOUT_SECS

/** Derive the canonical ATA for (mint, owner) the way the program does. */
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

function addrBytes(a: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(a));
}

/**
 * Off-chain accumulator mirror. Tracks every staked leaf so each test can mint
 * a valid Merkle `path` for the juror's index against the live on-chain root.
 * Same reference indexers use (SDK `buildAccumulator` + `proofFor`).
 *
 * Index accounting: `nextIndex` advances ONLY inside {@link setLeaf}, so a test
 * that arms a juror but throws before staking (e.g. the InvalidAmount case) does
 * not leave a hole in the leaf array — which would desync every later path.
 */
class TreeTracker {
  tree!: MerkleAccumulator;
  depth: number;
  nextIndex = 0;

  constructor(depth: number) {
    this.depth = depth;
  }

  async init() {
    this.tree = await buildAccumulator([], this.depth);
    return this;
  }

  /** Path for the NEXT leaf to be staked (the upcoming stake's proof). */
  pathForNext(): Promise<MSTNode[]> {
    return proofFor(this.tree, this.nextIndex);
  }

  /** Path for an already-staked leaf (used by unstake/mutation at a known index). */
  pathFor(index: number): Promise<MSTNode[]> {
    return proofFor(this.tree, index);
  }

  /**
   * Append a freshly-staked juror at `nextIndex`; rebuild; return the index.
   * Advancing `nextIndex` HERE (not in armJuror) keeps the leaf array hole-free
   * when a stake is bypassed client-side.
   */
  async setLeaf(juror: Address, amount: bigint): Promise<number> {
    const index = this.nextIndex;
    const leaves = [...this.tree.leaves];
    leaves[index] = { juror: addrBytes(juror), stake: amount };
    this.tree = await buildAccumulator(leaves, this.depth);
    this.nextIndex++;
    return index;
  }

  /** Rewrite an existing leaf (e.g. unstake reduces a stake); rebuild. */
  async updateLeaf(index: number, juror: Address, amount: bigint) {
    const leaves = [...this.tree.leaves];
    leaves[index] = { juror: addrBytes(juror), stake: amount };
    this.tree = await buildAccumulator(leaves, this.depth);
  }

  get rootHash(): Uint8Array {
    return this.tree.rootHash;
  }
}

/** Read an SPL token account amount (u64 LE @ offset 64). */
async function readTokenAmount(
  env: TestEnv,
  account: Address,
): Promise<bigint> {
  const res = await env.rpc
    .getAccountInfo(account, { encoding: "base64" })
    .send();
  if (!res.value) return 0n;
  const b = Buffer.from(res.value.data[0], "base64");
  return b.readBigUInt64LE(64);
}

describe("e2e: staking (requires Surfpool)", () => {
  let env: TestEnv;
  let mint!: Address;
  let subaccord!: Address;
  let vault!: Address;
  let pauseState!: Address;
  let tree!: TreeTracker;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;

    // 1) Pause singleton (idempotent: skip init if it already exists — stake
    //    reverts while paused, so it must be present + unpaused).
    const pause = await initializePause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
    );
    pauseState = pause.pauseState;
    const existing = await env.rpc
      .getAccountInfo(pauseState, { encoding: "base64" })
      .send();
    if (!existing.value) await env.sendIx(pause.instruction);

    // 2) Fresh staking-token mint.
    mint = (await createMint(env, 6)).mint;

    // 3) A Subaccord over `mint`.
    const args = defaultSubaccordArgs(mint, mint, env.payer.address, {
      feePerJuror: FEE_PER_JUROR,
      minStake: MIN_STAKE,
      depth: DEPTH,
    });
    const sub = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    subaccord = sub.subaccord;
    await env.sendIx(sub.instruction);

    vault = await ata(mint, subaccord);
    tree = await new TreeTracker(DEPTH).init();

    // Sanity: on-chain root == empty-tree root.
    const onChain = await fetchDecoded(env, subaccord, getSubaccordDecoder());
    expect(new Uint8Array(onChain!.rootHash)).toEqual(await emptyRoot(DEPTH));
  }, 120_000);

  /** Fresh funded juror + its staking ATA + a per-juror Accord facade. The
   *  accumulator leaf index is claimed inside the test on successful stake. */
  async function armJuror() {
    const juror = await fundSigner(env);
    await setTokenBalance(env, juror.address, mint, STAKE_FUND);
    const jurorAta = await ata(mint, juror.address);
    const jurorStake = await jurorStakePda(
      env.programId,
      subaccord,
      juror.address,
    );
    const accounts: StakingAccounts = {
      juror: juror.address,
      subaccord,
      pauseState,
      jurorStake,
      stakingToken: mint,
      jurorTokenAccount: jurorAta,
      stakeVault: vault,
    };
    const facade = new Accord({ endpoint: env.rpcUrl, signer: juror });
    return { juror, jurorAta, jurorStake, accounts, facade };
  }

  /** Decode the JurorStake at `pda` (account exists post-stake). */
  const readStake = (pda: Address) =>
    fetchDecoded(env, pda, getJurorStakeDecoder());
  const readSubaccord = () =>
    fetchDecoded(env, subaccord, getSubaccordDecoder());

  it("happy stake moves tokens into the vault + credits JurorStake.amount", async () => {
    if (!env.up) return;
    const { juror, jurorStake, accounts, facade } = await armJuror();

    const path = await tree.pathForNext();
    await env.sendIx(
      stake(facade.adapter, env.programId, accounts, STAKE_AMT, path),
    );
    const index = await tree.setLeaf(juror.address, STAKE_AMT);

    // vault gained the stake; juror ATA lost it.
    expect(await readTokenAmount(env, vault)).toBe(STAKE_AMT);
    expect(await readTokenAmount(env, accounts.jurorTokenAccount)).toBe(
      STAKE_FUND - STAKE_AMT,
    );

    const js = await readStake(jurorStake);
    expect(js).not.toBeNull();
    expect(js!.staked).toBe(STAKE_AMT);
    expect(js!.subaccord).toBe(subaccord);
    expect(js!.juror).toBe(accounts.juror);
    expect(js!.activeDraws).toBe(0);
    expect(js!.bump).toBeGreaterThan(0);

    // On-chain accumulator root matches the off-chain rebuild.
    const onChain = await readSubaccord();
    expect(new Uint8Array(onChain!.rootHash)).toEqual(tree.rootHash);
    void index;
  }, 60_000);

  it("happy withdraw (request → timelock → withdraw) drains the full stake", async () => {
    if (!env.up) return;
    const { juror, jurorStake, jurorAta, accounts, facade } = await armJuror();

    const stakePath = await tree.pathForNext();
    await env.sendIx(
      stake(facade.adapter, env.programId, accounts, STAKE_AMT, stakePath),
    );
    const index = await tree.setLeaf(juror.address, STAKE_AMT);
    let js = await readStake(jurorStake);
    expect(js!.staked).toBe(STAKE_AMT);

    // Phase 1: requestWithdraw — ledger debit (amount → 0, pending_withdrawal banked).
    const unstakePath = await tree.pathFor(index);
    const reqIx = await requestWithdraw(
      facade.adapter,
      env.programId,
      accounts,
      STAKE_AMT,
      unstakePath,
    );
    await env.sendIx(reqIx);
    await tree.updateLeaf(index, juror.address, 0n);

    js = await readStake(jurorStake);
    expect(js!.staked).toBe(0n);

    // Phase 2: warp past WITHDRAWAL_DELAY, then withdraw moves tokens.
    await warpForwardSeconds(env, WITHDRAWAL_DELAY_SECS);
    await env.sendIx(withdraw(facade.adapter, env.programId, accounts));

    // capital returned to the juror ATA
    expect(await readTokenAmount(env, jurorAta)).toBe(STAKE_FUND);

    const onChain = await readSubaccord();
    expect(new Uint8Array(onChain!.rootHash)).toEqual(tree.rootHash);
  }, 60_000);

  it("stake with amount 0 is rejected (InvalidAmount)", async () => {
    if (!env.up) return;
    const { accounts, facade } = await armJuror();
    const path = await tree.pathForNext();
    // SDK surfaces the on-chain `InvalidAmount` require as a typed client guard
    // before building the instruction. No stake ⇒ nextIndex unchanged (no hole).
    expect(() =>
      stake(facade.adapter, env.programId, accounts, 0n, path),
    ).toThrow(/InvalidAmount/);
  }, 60_000);

  it("requestWithdraw over balance reverts on-chain (InsufficientBalance)", async () => {
    if (!env.up) return;
    const { juror, jurorStake, accounts, facade } = await armJuror();
    const stakePath = await tree.pathForNext();
    await env.sendIx(
      stake(facade.adapter, env.programId, accounts, STAKE_AMT, stakePath),
    );
    const index = await tree.setLeaf(juror.address, STAKE_AMT);
    expect((await readStake(jurorStake))!.staked).toBe(STAKE_AMT);

    // Bypass the facade's `assertCanUnstake` pre-check to exercise the on-chain
    // `InsufficientBalance` require, but with a VALID path so the path-verify
    // gate passes first.
    const path = await tree.pathFor(index);
    const ix = facade.adapter.buildRequestWithdraw({
      programId: env.programId,
      accounts,
      amount: STAKE_AMT + 1n,
      path,
    });
    await expect(env.sendIx(ix)).rejects.toThrow();

    // stake untouched on revert
    expect((await readStake(jurorStake))!.staked).toBe(STAKE_AMT);
  }, 60_000);

  it("withdraw while active_draws>0 reverts on-chain (StakeLocked)", async () => {
    if (!env.up) return;
    const { juror, jurorStake, accounts, facade } = await armJuror();
    const stakePath = await tree.pathForNext();
    await env.sendIx(
      stake(facade.adapter, env.programId, accounts, STAKE_AMT, stakePath),
    );
    const index = await tree.setLeaf(juror.address, STAKE_AMT);

    // Phase 1 succeeds even with active_draws > 0 (no gate at requestWithdraw).
    const reqPath = await tree.pathFor(index);
    await env.sendIx(
      requestWithdraw(
        facade.adapter,
        env.programId,
        accounts,
        STAKE_AMT,
        reqPath,
      ),
    );
    await tree.updateLeaf(index, juror.address, 0n);

    // Simulate the juror being drawn into a live dispute by mutating
    // `active_draws` directly on the JurorStake PDA (the LiteSVM test does the
    // same via `set_account`). Layout: disc(8) subaccord(32) juror(32) amount(8)
    // active_draws(u32 LE @ offset 80).
    const acc = await env.rpc
      .getAccountInfo(jurorStake, { encoding: "base64" })
      .send();
    const raw = Buffer.from(acc.value!.data[0], "base64");
    raw.writeUInt32LE(2, 80);
    await setAccountRaw(env, jurorStake, {
      lamports: acc.value!.lamports,
      data: new Uint8Array(raw),
      owner: env.programId,
    });

    // Phase 2 reverts: active_draws > 0 gate fires at withdraw.
    await expect(
      env.sendIx(withdraw(facade.adapter, env.programId, accounts)),
    ).rejects.toThrow();
  }, 60_000);
});

describe("canUnstake guard (pure, no chain)", () => {
  const view = (
    over: Partial<{ staked: bigint; activeDraws: number }> = {},
  ) => ({
    juror: "11111111111111111111111111111111" as Address,
    staked: 1_000n,
    feesEarned: 0n,
    activeDraws: 0,
    ...over,
  });

  it("rejects a zero / negative amount (InvalidAmount)", () => {
    expect(canUnstake(view(), 0n)).toEqual({
      ok: false,
      reason: "InvalidAmount",
    });
  });

  it("rejects while the juror is drawn into a live dispute (StakeLocked)", () => {
    expect(canUnstake(view({ activeDraws: 1 }), 500n)).toEqual({
      ok: false,
      reason: "StakeLocked",
    });
  });

  it("rejects an amount exceeding the staked balance (InsufficientBalance)", () => {
    expect(canUnstake(view(), 2_000n)).toEqual({
      ok: false,
      reason: "InsufficientBalance",
    });
  });

  it("approves a valid unstake", () => {
    expect(canUnstake(view(), 500n)).toEqual({ ok: true });
    expect(canUnstake(view({ staked: 1_000n }), 1_000n)).toEqual({ ok: true });
  });
});
