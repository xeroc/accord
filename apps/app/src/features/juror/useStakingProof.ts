/**
 * useStakingProof — fetch the Subaccord + all its JurorStakes and build the
 * MST accumulator Merkle proof for `stake` / `requestWithdraw` / `reconcileStake`.
 *
 * The on-chain instructions require a path that authenticates against the
 * stored accumulator root (ADR-0012). `prepareStakeProof` rebuilds the tree
 * locally, verifies the root matches, and returns the proof for the juror's
 * leaf. A root mismatch means stale data — the caller refetches.
 */
import { useQuery } from "@tanstack/react-query";
import { type Address, type ReadonlyUint8Array } from "@solana/kit";
import {
  type SubaccordAccumulatorView,
  type JurorStakeLeaf,
  type StakeProofResult,
  findJurorStakesBySubaccord,
  prepareStakeProof,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";
import { useSubaccord } from "../dispute/useSubaccord";

/** View of the on-chain accumulator fields prepareStakeProof consumes.
 *  `rootHash` is `ReadonlyUint8Array` on the decoded account but the proof
 *  builder expects a mutable `Uint8Array` — copy once at the boundary. */
function subaccordView(s: {
  rootHash: Uint8Array | ReadonlyUint8Array;
  nextIndex: number;
  depth: number;
}): SubaccordAccumulatorView {
  return {
    rootHash: new Uint8Array(s.rootHash),
    nextIndex: s.nextIndex,
    depth: s.depth,
  };
}

/** Map a decoded JurorStake to the leaf prepareStakeProof expects. */
function leaf(js: {
  juror: Address;
  staked: bigint;
  treeIndex: number;
}): JurorStakeLeaf {
  return { juror: js.juror, staked: js.staked, treeIndex: js.treeIndex };
}

/**
 * Build the stake/unstake/reconcile Merkle proof for `juror` within `subaccord`.
 *
 * Returns the {@link StakeProofResult} or throws (root mismatch / tree full).
 * Callers gate the UI on `isError` and surface the message.
 */
export function useStakingProof(
  subaccordAddr: Address | undefined,
  juror: Address | undefined,
) {
  const crpc = useClusterRpc();
  const { data: subaccord } = useSubaccord(subaccordAddr);

  return useQuery<StakeProofResult>({
    queryKey: [
      "staking-proof",
      subaccordAddr,
      juror,
      subaccord?.data.rootHash,
      crpc?.endpoint,
    ],
    queryFn: async () => {
      if (!subaccordAddr || !juror || !crpc || !subaccord) {
        throw new Error("Missing subaccord or juror.");
      }
      const stakes = await findJurorStakesBySubaccord(crpc.rpc, subaccordAddr);
      return prepareStakeProof(
        subaccordView(subaccord.data),
        stakes.map((s) => leaf(s.data)),
        juror,
      );
    },
    enabled: !!subaccordAddr && !!juror && !!subaccord && !!crpc,
    // The proof is derived from the on-chain root — refetch when subaccord
    // data changes (rootHash is in the key). 30s stale time covers the
    // stake → action round-trip.
    staleTime: 30_000,
    retry: false, // root mismatch is a data error, not transient
  });
}
