// reclaim.spec.ts — RECLAIM-LEAF slot recycling e2e (Surfpool + jest + SDK).
//
// Verifies the free-list linked-list allocator closes the permanent-DoS hole
// without corrupting the MST accumulator or disrupting the draw lifecycle:
//
//  1. Stake jurors → drain one → reclaim its slot → verify free-list push + root
//  2. Re-stake a new juror into the recycled slot → verify slot pop + root
//  3. Create a dispute on the recycled juror set → inject VRF → verify frozen
//     root matches the live accumulator (merkle integrity after reclaim)
//
// Multi-signer: each juror gets its own Accord facade (adapter pins signer).
// Singleton: PauseState is idempotent — coexists with sibling specs.
import {
  Accord,
  stake,
  requestWithdraw,
  withdraw,
  reclaimSlot,
  initializePause,
  createSubaccord,
  createDispute,
  getJurorStakeDecoder,
  getSubaccordDecoder,
  getDisputeDecoder,
  buildAccumulator,
  proofFor,
  emptyRoot,
  findJurorStakePda,
  findDisputePda,
  type StakingAccounts,
  type MSTNode,
  type MerkleAccumulator,
} from "@useaccord/sdk";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  type Address,
} from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { warpForwardSeconds } from "./setup/cheats.js";
import {
  createMint,
  setTokenBalance,
  TOKEN_PROGRAM_ID,
} from "./setup/tokens.js";
import { defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import { fetchDecoded } from "./setup/assertions.js";
import { injectCommittedVrf } from "./setup/vrf.js";

const ATA_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
const SEED_JUROR_STAKE = new Uint8Array([115, 116, 97, 107, 101]); // "stake"

const FEE_PER_JUROR = 1_000_000n;
const MIN_STAKE = 1_000n;
const STAKE_FUND = 50_000n;
const STAKE_AMT = 5_000n;
const ALPHA_BPS = 1_000n;
const MIN_INITIAL = MIN_STAKE + (ALPHA_BPS * MIN_STAKE) / 10_000n;
const DEPTH = 3; // 2^3 = 8 slots
const WITHDRAWAL_DELAY_SECS = 3 * 24 * 60 * 60;
const UINT32_MAX = 4294967295;

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

function addrBytes(a: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(a));
}

/**
 * Off-chain accumulator mirror (same as staking.spec.ts). Tracks every leaf
 * so each test can mint a valid Merkle path against the live root.
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

  async updateLeaf(index: number, juror: Address, amount: bigint) {
    const leaves = [...this.tree.leaves];
    leaves[index] = { juror: addrBytes(juror), stake: amount };
    this.tree = await buildAccumulator(leaves, this.depth);
  }

  /** Blank a leaf to (default, 0) — simulates reclaim_slot's root update. */
  async blankLeaf(index: number) {
    const leaves = [...this.tree.leaves];
    leaves[index] = { juror: new Uint8Array(32), stake: 0n };
    this.tree = await buildAccumulator(leaves, this.depth);
  }

  get rootHash(): Uint8Array {
    return this.tree.rootHash;
  }

  get totalStake(): bigint {
    return this.tree.rootSum;
  }
}

describe("e2e: RECLAIM-LEAF slot recycling (requires Surfpool)", () => {
  let env: TestEnv;
  let mint!: Address;
  let subaccord!: Address;
  let vault!: Address;
  let pauseState!: Address;
  let tree!: TreeTracker;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;

    // 1) Pause singleton (idempotent).
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

    // 3) Subaccord (depth=3, 8 slots — small for fast fill/recovery).
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
    expect(onChain!.freeHead).toBe(UINT32_MAX);
  }, 120_000);

  async function armJuror() {
    const juror = await fundSigner(env);
    await setTokenBalance(env, juror.address, mint, STAKE_FUND);
    const jurorAta = await ata(mint, juror.address);
    const [jurorStakePdaAddr] = await findJurorStakePda({
      subaccord,
      juror: juror.address,
    });
    const accounts: StakingAccounts = {
      juror: juror.address,
      subaccord,
      pauseState,
      jurorStake: jurorStakePdaAddr,
      stakingToken: mint,
      jurorTokenAccount: jurorAta,
      stakeVault: vault,
    };
    const facade = new Accord({ endpoint: env.rpcUrl, signer: juror });
    return { juror, jurorAta, jurorStake: jurorStakePdaAddr, accounts, facade };
  }

  const readSubaccord = () =>
    fetchDecoded(env, subaccord, getSubaccordDecoder());
  const readStake = (pda: Address) =>
    fetchDecoded(env, pda, getJurorStakeDecoder());

  // ─── helpers: stake + drain ─────────────────────────────────────────────

  /** Stake a juror and advance the tree tracker. Returns the juror + index. */
  async function stakeJuror() {
    const j = await armJuror();
    const path = await tree.pathForNext();
    await env.sendIx(
      stake(j.facade.adapter, env.programId, j.accounts, STAKE_AMT, path),
    );
    const idx = await tree.setLeaf(j.juror.address, STAKE_AMT);
    return { ...j, index: idx };
  }

  /** Fully drain a juror via request_withdraw + timelock + withdraw. */
  async function drainJuror(j: {
    juror: { address: Address };
    facade: Accord;
    accounts: StakingAccounts;
    index: number;
  }) {
    const path = await tree.pathFor(j.index);
    await env.sendIx(
      requestWithdraw(
        j.facade.adapter,
        env.programId,
        j.accounts,
        STAKE_AMT,
        path,
      ),
    );
    await tree.updateLeaf(j.index, j.juror.address, 0n);
    await warpForwardSeconds(env, WITHDRAWAL_DELAY_SECS + 1);
    await env.sendIx(
      withdraw(j.facade.adapter, env.programId, j.accounts),
    );
  }

  // ─── tests ──────────────────────────────────────────────────────────────

  it("reclaims a drained juror's slot onto the free list", async () => {
    if (!env.up) return;

    // Stake juror A at index 0.
    const a = await stakeJuror();
    a_jurorStake_addr = a.jurorStake;
    expect(a.index).toBe(0);

    // Drain A fully.
    await drainJuror(a);
    const aStakeDrained = await readStake(a.jurorStake);
    expect(aStakeDrained!.staked).toBe(0n);
    expect(aStakeDrained!.nextFree).toBe(UINT32_MAX);

    // Reclaim A's slot.
    const reclaimPath = await tree.pathFor(0);
    await env.sendIx(
      reclaimSlot(
        env.accord.adapter,
        env.programId,
        { subaccord, jurorStake: a.jurorStake },
        reclaimPath,
      ),
    );

    // After reclaim: free_head = 0, leaf blanked to (default, 0) in the root.
    await tree.blankLeaf(0);
    const sub = await readSubaccord();
    expect(sub!.freeHead).toBe(0);
    expect(new Uint8Array(sub!.rootHash)).toEqual(tree.rootHash);
    expect(sub!.totalStake).toBe(tree.totalStake);

    // JurorStake persists as a free-list node (nextFree = old freeHead = MAX).
    const aStakeReclaimed = await readStake(a.jurorStake);
    expect(aStakeReclaimed!.nextFree).toBe(UINT32_MAX);
    expect(aStakeReclaimed!.staked).toBe(0n);
  });

  it("re-stakes a new juror into the recycled slot (free-list pop)", async () => {
    if (!env.up) return;

    // The free list head is at index 0 (from the previous test).
    const subBefore = await readSubaccord();
    expect(subBefore!.freeHead).toBe(0);
    const nextIndexBefore = subBefore!.nextIndex;

    // Arm a NEW juror B.
    const b = await armJuror();

    // Path for index 0 (the blanked leaf).
    const path = await tree.pathFor(0);

    // Stake with freedSlotAccount = A's JurorStake PDA.
    await env.sendIx(
      stake(
        b.facade.adapter,
        env.programId,
        b.accounts,
        STAKE_AMT,
        path,
        a_jurorStake_addr,
      ),
    );

    // B should be at tree_index 0 (recycled).
    await tree.setLeaf(b.juror.address, STAKE_AMT);
    // setLeaf advances nextIndex locally, but on-chain it should NOT advance
    // because the slot was popped from the free list. Compensate:
    tree.nextIndex--; // undo the bump — the slot was recycled, not bump-allocated.

    const bStake = await readStake(b.jurorStake);
    expect(bStake!.treeIndex).toBe(0);
    expect(bStake!.staked).toBe(STAKE_AMT);
    expect(bStake!.nextFree).toBe(UINT32_MAX);

    // nextIndex unchanged (slot recycled, not bump-allocated).
    const subAfter = await readSubaccord();
    expect(subAfter!.nextIndex).toBe(nextIndexBefore);

    // Free list empty again.
    expect(subAfter!.freeHead).toBe(UINT32_MAX);

    // Root matches off-chain tree.
    expect(new Uint8Array(subAfter!.rootHash)).toEqual(tree.rootHash);

    // The freed (A's) JurorStake should be closed.
    const aStakeGone = await readStake(a_jurorStake_addr);
    expect(aStakeGone).toBeNull();
  });

  it("dispute + VRF freeze succeeds on recycled jurors (merkle integrity)", async () => {
    if (!env.up) return;

    // We have juror B at index 0 (recycled). Stake 2 more jurors (indices 1, 2).
    const c = await stakeJuror();
    const d = await stakeJuror();
    expect(c.index).toBe(1);
    expect(d.index).toBe(2);

    // Now we have 3 active stakers (B, C, D). Create a dispute.
    const filerAta = await ata(mint, env.payer.address);
    await setTokenBalance(env, env.payer.address, mint, FEE_PER_JUROR * 3n);

    const feeVault = await ata(mint, subaccord);
    const nonce = crypto.getRandomValues(new BigUint64Array(1))[0]!;
    const { dispute, instruction } = await createDispute(
      env.accord.adapter,
      {
        filer: env.payer.address,
        subaccord,
        pauseState,
        feeToken: mint,
        filerTokenAccount: filerAta,
        feeVault,
      },
      {
        options: [
          new Uint8Array(32).fill(0),
          new Uint8Array(32).fill(1),
        ],
        evidenceHash: randomBytes32(),
        nonce,
        fee: FEE_PER_JUROR * 3n,
      },
      env.programId,
    );
    await env.sendIx(instruction);

    // Inject VRF — freeze the root. The frozen root MUST match the live
    // accumulator root. If reclaim corrupted the tree, this would diverge.
    const sub = await readSubaccord();
    const vrf = new Uint8Array(32).fill(77);
    await injectCommittedVrf(
      env,
      dispute,
      vrf,
      new Uint8Array(sub!.rootHash),
      sub!.totalStake,
    );

    // Verify the dispute state: VRF committed, root frozen.
    const onDispute = await fetchDecoded(env, dispute, getDisputeDecoder());
    expect(onDispute).not.toBeNull();
    expect(new Uint8Array(onDispute!.frozenRoot)).toEqual(tree.rootHash);
    expect(onDispute!.frozenTotalStake).toBe(tree.totalStake);

    // The frozen root matches the off-chain tree — merkle integrity proven.
    // The recycled juror B is part of the frozen tree and can be drawn.
  });

  it("full attack + recovery: fill all slots, reclaim, re-stake", async () => {
    if (!env.up) return;

    // This test uses a FRESH subaccord to avoid interference.
    const args = defaultSubaccordArgs(mint, mint, env.payer.address, {
      feePerJuror: FEE_PER_JUROR,
      minStake: MIN_STAKE,
      depth: 2, // 2^2 = 4 slots — tiny for fast exhaustion
    });
    const sub2 = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    await env.sendIx(sub2.instruction);
    const vault2 = await ata(mint, sub2.subaccord);
    const tree2 = await new TreeTracker(2).init();

    // Fill all 4 slots with throwaway jurors, then drain each.
    const attackers: {
      juror: { address: Address };
      facade: Accord;
      accounts: StakingAccounts;
      jurorStake: Address;
      index: number;
    }[] = [];

    for (let i = 0; i < 4; i++) {
      const j = await fundSigner(env);
      await setTokenBalance(env, j.address, mint, STAKE_FUND);
      const jAta = await ata(mint, j.address);
      const [jsPda] = await findJurorStakePda({
        subaccord: sub2.subaccord,
        juror: j.address,
      });
      const accounts: StakingAccounts = {
        juror: j.address,
        subaccord: sub2.subaccord,
        pauseState,
        jurorStake: jsPda,
        stakingToken: mint,
        jurorTokenAccount: jAta,
        stakeVault: vault2,
      };
      const facade = new Accord({ endpoint: env.rpcUrl, signer: j });
      const path = await tree2.pathForNext();
      await env.sendIx(
        stake(facade.adapter, env.programId, accounts, STAKE_AMT, path),
      );
      const idx = await tree2.setLeaf(j.address, STAKE_AMT);
      attackers.push({ juror: j, facade, accounts, jurorStake: jsPda, index: idx });
    }

    // Drain all.
    for (const a of attackers) {
      const path = await tree2.pathFor(a.index);
      await env.sendIx(
        requestWithdraw(a.facade.adapter, env.programId, a.accounts, STAKE_AMT, path),
      );
      await tree2.updateLeaf(a.index, a.juror.address, 0n);
    }
    await warpForwardSeconds(env, WITHDRAWAL_DELAY_SECS + 1);
    for (const a of attackers) {
      await env.sendIx(withdraw(a.facade.adapter, env.programId, a.accounts));
    }

    // Reclaim all 4 slots.
    for (const a of attackers) {
      const path = await tree2.pathFor(a.index);
      await env.sendIx(
        reclaimSlot(env.accord.adapter, env.programId, {
          subaccord: sub2.subaccord,
          jurorStake: a.jurorStake,
        }, path),
      );
      await tree2.blankLeaf(a.index);
    }

    // Free list should be non-empty.
    const sub2Data = await fetchDecoded(env, sub2.subaccord, getSubaccordDecoder());
    expect(sub2Data!.freeHead).not.toBe(UINT32_MAX);

    // Re-stake 4 new jurors into recycled slots.
    for (let i = 0; i < 4; i++) {
      const j = await fundSigner(env);
      await setTokenBalance(env, j.address, mint, STAKE_FUND);
      const jAta = await ata(mint, j.address);
      const [jsPda] = await findJurorStakePda({
        subaccord: sub2.subaccord,
        juror: j.address,
      });
      const accounts: StakingAccounts = {
        juror: j.address,
        subaccord: sub2.subaccord,
        pauseState,
        jurorStake: jsPda,
        stakingToken: mint,
        jurorTokenAccount: jAta,
        stakeVault: vault2,
      };
      const facade = new Accord({ endpoint: env.rpcUrl, signer: j });

      // Read the free head to find which freed JurorStake to pass.
      const subState = await fetchDecoded(env, sub2.subaccord, getSubaccordDecoder());
      const freeIdx = subState!.freeHead;
      // Find the attacker whose JurorStake has tree_index == freeIdx.
      const freedAttacker = attackers.find(
        (a) => a.index === freeIdx,
      )!;

      const path = await tree2.pathFor(freeIdx);
      await env.sendIx(
        stake(facade.adapter, env.programId, accounts, STAKE_AMT, path, freedAttacker.jurorStake),
      );
      // Update tree: set leaf at the recycled index.
      tree2.tree.leaves[freeIdx] = { juror: addrBytes(j.address), stake: STAKE_AMT };
      tree2.tree = await buildAccumulator(tree2.tree.leaves, 2);
      // Don't advance nextIndex — slot was recycled.
    }

    // Verify full recovery: nextIndex never exceeded 4, free list empty.
    const final = await fetchDecoded(env, sub2.subaccord, getSubaccordDecoder());
    expect(final!.nextIndex).toBe(4); // unchanged from the attack
    expect(final!.freeHead).toBe(UINT32_MAX); // all slots re-occupied
    expect(final!.stakerCount).toBe(4); // all new jurors active
    expect(new Uint8Array(final!.rootHash)).toEqual(tree2.rootHash);
  });
});

// Hoisted reference to juror A's JurorStake PDA (set in the first test,
// consumed in the second). Tests run sequentially within a describe block.
let a_jurorStake_addr: Address;
