/**
 * useDispute — read hook for the backing Accord Dispute of a CanonItem
 * (accord-gg8f, milestone §1 path (d) + architecture decision #7).
 *
 * Reads the Accord `Dispute` PDA at `CanonItem.activeDispute` over bare RPC via
 * `@useaccord/sdk`'s generated fetcher (no signer). Returns `null` when the
 * item has no active dispute (`activeDispute` is the zero sentinel) or the
 * dispute account does not exist.
 */
import { useQuery } from "@tanstack/react-query";
import { type Account, type Address } from "@solana/kit";
import { fetchMaybeDispute, type Dispute } from "@useaccord/sdk";

import { useClusterRpc } from "@/shared/rpc";
import { ZERO_ADDRESS } from "@/shared/wallet";

export function useDispute(activeDispute: string | undefined) {
  const crpc = useClusterRpc();
  const enabled =
    !!activeDispute && activeDispute !== ZERO_ADDRESS && !!crpc;
  return useQuery({
    queryKey: ["accord-dispute", activeDispute, crpc?.endpoint],
    queryFn: async () => {
      if (!enabled || !crpc) return null;
      const maybe = await fetchMaybeDispute(crpc.rpc, activeDispute as Address);
      if (!maybe.exists) return null;
      return maybe as Account<Dispute>;
    },
    enabled,
    staleTime: 15_000,
  });
}
