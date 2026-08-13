/**
 * useCanonItem — read hook for a decoded CanonItem by address.
 *
 * Uses the generated `fetchMaybeCanonItem` over the active cluster's bare RPC
 * (no signer needed). Mirrors apps/app's `useSubaccord` pattern.
 */
import { useQuery } from "@tanstack/react-query";
import { type Account, type Address } from "@solana/kit";
import { fetchMaybeCanonItem, type CanonItem } from "@useaccord/canon";

import { useClusterRpc } from "@/shared/rpc";

export function useCanonItem(address: string | undefined) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["canon-item", address, crpc?.endpoint],
    queryFn: async () => {
      if (!address || !crpc) return null;
      const maybe = await fetchMaybeCanonItem(crpc.rpc, address as Address);
      if (!maybe.exists) return null;
      return maybe as Account<CanonItem>;
    },
    enabled: !!address && !!crpc,
    staleTime: 15_000,
  });
}
