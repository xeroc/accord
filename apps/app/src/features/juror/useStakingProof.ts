/**
 * useStakingProof — fetch the Subaccord + all its JurorStakes and build the
 * MST accumulator Merkle proof for `stake` / `requestWithdraw` / `reconcileStake`.
 *
 * The on-chain instructions require a path that authenticates against the
 * stored accumulator root (ADR-0012). The RPC fetch (`findJurorStakesBySubaccord`)
 * runs on the main thread; the CPU-bound `prepareStakeProof` (tree rebuild +
 * proof) runs in a Web Worker (`stakingProofWorker.ts`) so typing into the
 * amount field never blocks on proof computation. A root mismatch means stale
 * data — the caller refetches.
 */
import { useQuery } from "@tanstack/react-query";
import { type Address, type ReadonlyUint8Array } from "@solana/kit";
import {
  type SubaccordAccumulatorView,
  type JurorStakeLeaf,
  type StakeProofResult,
  findJurorStakesBySubaccord,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";
import { useSubaccord } from "../dispute/useSubaccord";
import type { ProofRequest, ProofResponse } from "./stakingProofWorker";

// --- Web Worker client (singleton, promise-correlated) -----------------------

let worker: Worker | null = null;
let nextReqId = 1;
const pending = new Map<
  number,
  { resolve: (v: StakeProofResult) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./stakingProofWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<ProofResponse>) => {
      const { id, ok, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok && result) p.resolve(result);
      else p.reject(new Error(error ?? "Proof worker failed"));
    };
    worker.onerror = (e) => {
      const msg = e.message || "Proof worker crashed";
      for (const p of pending.values()) p.reject(new Error(msg));
      pending.clear();
    };
  }
  return worker;
}

/** Run `prepareStakeProof` in the worker; resolves with the proof or throws. */
function computeProof(
  req: Omit<ProofRequest, "id">,
): Promise<StakeProofResult> {
  const id = nextReqId++;
  return new Promise<StakeProofResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...req });
  });
}

// --- view + leaf mappers (data crosses the worker boundary via structured clone) ---

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

// --- hook --------------------------------------------------------------------

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
      // RPC fetch stays on the main thread (network-bound, not CPU-bound).
      const stakes = await findJurorStakesBySubaccord(crpc.rpc, subaccordAddr);
      // CPU-bound tree rebuild + proof runs in the worker.
      return computeProof({
        subaccord: subaccordView(subaccord.data),
        jurorStakes: stakes.map((s) => leaf(s.data)),
        juror,
      });
    },
    enabled: !!subaccordAddr && !!juror && !!subaccord && !!crpc,
    // The proof is derived from the on-chain root — refetch when subaccord
    // data changes (rootHash is in the key). 30s stale time covers the
    // stake → action round-trip.
    staleTime: 30_000,
    retry: false, // root mismatch is a data error, not transient
  });
}
