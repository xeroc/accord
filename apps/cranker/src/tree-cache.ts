/**
 * tree-cache.ts — per-Subaccord MST accumulator cache with frozen-root
 * verification (milestone accord-27r5, bean accord-gpo7).
 *
 * `draw_seat` authenticates each juror against the stake tree frozen at
 * VRF-commit time (`dispute.frozenRoot`). Between freeze and draw a juror may
 * stake or `request_withdraw`, mutating the live tree and diverging it from the
 * frozen snapshot. This module:
 *
 *   1. Fetches every JurorStake for the Subaccord (GPA, SDK
 *      `findJurorStakesBySubaccord`).
 *   2. Rebuilds the canonical MST (SDK `buildAccumulator`).
 *   3. Verifies the rebuilt root == `dispute.frozenRoot`.
 *      Match → accumulator returned (draw proceeds).
 *      Mismatch → null (skip draw this cycle; a juror moved post-freeze).
 *   4. Caches the accumulator per Subaccord, invalidated by root change — a
 *      cheap `fetchMaybeSubaccord` root check avoids the expensive GPA on every
 *      cycle when the pool is stable (the common case).
 *
 * Sources of truth:
 *   - SDK MST builder: @useaccord/sdk `buildAccumulator` / `proofFor`
 *   - SDK stake-flow proof: packages/sdk/src/methods/stakeFlow.ts (leaf layout)
 *   - on-chain draw_seat: programs/accord/src/lib.rs
 */
import {
  getAddressEncoder,
  type Address,
  type ReadonlyUint8Array,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  buildAccumulator,
  fetchMaybeSubaccord,
  findJurorStakesBySubaccord,
  type LeafClaim,
  type MerkleAccumulator,
} from "@useaccord/sdk";

/** Minimal stake leaf needed to build the accumulator. */
export interface StakeLeaf {
  juror: Address;
  staked: bigint;
  /** Canonical leaf position assigned at first stake. */
  treeIndex: number;
}

/** The live Subaccord fields the cache invalidation check reads. */
export interface SubaccordAccumulatorMeta {
  rootHash: Uint8Array;
  depth: number;
}

export interface TreeCacheConfig {
  /** Override the Subaccord fetch (tests). Defaults to SDK `fetchMaybeSubaccord`. */
  fetchSubaccord?: (subaccord: Address) => Promise<SubaccordAccumulatorMeta>;
  /** Override the JurorStake scan (tests). Defaults to SDK GPA scan. */
  fetchStakes?: (subaccord: Address) => Promise<StakeLeaf[]>;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Build the canonical depth-`depth` accumulator from stake leaves, placing each
 * at its canonical `treeIndex` and padding gaps with zero leaves. Pure — no
 * chain access, deterministic from the same leaves + depth.
 *
 * Mirrors the leaf-layout logic in `packages/sdk/src/methods/stakeFlow.ts`
 * (`prepareStakeProof`) — byte-exact against the on-chain verifier.
 */
export async function buildAccumulatorFromStakes(
  stakes: readonly StakeLeaf[],
  depth: number,
): Promise<MerkleAccumulator> {
  const size = 2 ** depth;
  const leaves: LeafClaim[] = new Array(size);
  for (let i = 0; i < size; i++) {
    leaves[i] = { juror: new Uint8Array(32), stake: 0n };
  }
  for (const s of stakes) {
    if (s.treeIndex < 0 || s.treeIndex >= size) {
      throw new Error(`InvalidTreeIndex: ${s.treeIndex} out of range for depth ${depth}`);
    }
    leaves[s.treeIndex] = { juror: addressBytes(s.juror), stake: s.staked };
  }
  return buildAccumulator(leaves, depth);
}

/**
 * Per-Subaccord MST cache. {@link get} returns the current accumulator (cached
 * when the live root is unchanged); {@link getVerifiedForDispute} additionally
 * verifies it matches the dispute's frozen root, returning `null` on mismatch
 * (the draw crank skips that cycle).
 */
export class TreeCache {
  private cache = new Map<Address, { rootHash: Uint8Array; accumulator: MerkleAccumulator }>();

  constructor(
    private readonly rpc: Rpc<SolanaRpcApi>,
    private readonly config: TreeCacheConfig = {},
  ) {}

  /** The canonical accumulator for `subaccord`, rebuilt only when the root moves. */
  async get(subaccord: Address): Promise<MerkleAccumulator> {
    const live = await this.fetchSubaccord(subaccord);
    const cached = this.cache.get(subaccord);
    if (cached !== undefined && bytesEqual(cached.rootHash, live.rootHash)) {
      return cached.accumulator;
    }
    const stakes = await this.fetchStakes(subaccord);
    const accumulator = await buildAccumulatorFromStakes(stakes, live.depth);
    this.cache.set(subaccord, { rootHash: accumulator.rootHash, accumulator });
    return accumulator;
  }

  /**
   * Verify the live tree matches `dispute.frozenRoot`. Returns the accumulator on
   * match, or `null` on mismatch (a juror staked/withdrew post-freeze — skip
   * draw this cycle, retry next).
   */
  async getVerifiedForDispute(dispute: {
    subaccord: Address;
    frozenRoot: ReadonlyUint8Array;
  }): Promise<MerkleAccumulator | null> {
    const accumulator = await this.get(dispute.subaccord);
    if (!bytesEqual(accumulator.rootHash, dispute.frozenRoot)) {
      this.config.log?.("frozen root mismatch — skipping draw", {
        subaccord: dispute.subaccord,
      });
      return null;
    }
    return accumulator;
  }

  private async fetchSubaccord(subaccord: Address): Promise<SubaccordAccumulatorMeta> {
    if (this.config.fetchSubaccord) return this.config.fetchSubaccord(subaccord);
    const maybe = await fetchMaybeSubaccord(this.rpc, subaccord);
    if (!maybe.exists) {
      throw new Error(`Subaccord not found: ${subaccord}`);
    }
    return {
      rootHash: new Uint8Array(maybe.data.rootHash),
      depth: maybe.data.depth,
    };
  }

  private async fetchStakes(subaccord: Address): Promise<StakeLeaf[]> {
    if (this.config.fetchStakes) return this.config.fetchStakes(subaccord);
    const accounts = await findJurorStakesBySubaccord(this.rpc, subaccord);
    return accounts.map((a) => ({
      juror: a.data.juror,
      staked: a.data.staked,
      treeIndex: a.data.treeIndex,
    }));
  }
}

/** Address → 32 raw bytes (the leaf's `juror` field). */
function addressBytes(addr: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(addr));
}

/** Constant-time byte comparison. */
function bytesEqual(a: Uint8Array, b: Uint8Array | ReadonlyUint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
