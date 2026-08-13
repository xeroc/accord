/**
 * useCanonList — read hook for a decoded CanonList by address.
 *
 * The list supplies `withdrawalTimelock` (the challenge-window length) +
 * `feeMint` for the withdrawal countdown + stake display. Read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { type Account, type Address } from "@solana/kit";
import { fetchMaybeCanonList, type CanonList } from "@useaccord/canon";

import { useClusterRpc } from "@/shared/rpc";

export function useCanonList(address: string | undefined) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["canon-list", address, crpc?.endpoint],
    queryFn: async () => {
      if (!address || !crpc) return null;
      const maybe = await fetchMaybeCanonList(crpc.rpc, address as Address);
      if (!maybe.exists) return null;
      return maybe as Account<CanonList>;
    },
    enabled: !!address && !!crpc,
    staleTime: 30_000,
  });
}
