import { useQuery } from "@tanstack/react-query";
import { type Account, type Address } from "@solana/kit";
import { type Subaccord, fetchMaybeSubaccord } from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";

export function useSubaccord(address: string | undefined) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["subaccord", address, crpc?.endpoint],
    queryFn: async () => {
      if (!address || !crpc) return null;
      const maybe = await fetchMaybeSubaccord(crpc.rpc, address as Address);
      if (!maybe.exists) return null;
      return maybe as Account<Subaccord>;
    },
    enabled: !!address && !!crpc,
    staleTime: 30_000,
  });
}
