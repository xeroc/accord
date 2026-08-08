import { useQuery } from "@tanstack/react-query";
import { type Account, type Address } from "@solana/kit";
import { type Subaccord, fetchMaybeSubaccord } from "@useaccord/sdk";

import { createRpc, getCluster } from "../../shared/cluster";

export function useSubaccord(address: string | undefined) {
  return useQuery({
    queryKey: ["subaccord", address, getCluster()],
    queryFn: async () => {
      if (!address) return null;
      const maybe = await fetchMaybeSubaccord(createRpc(), address as Address);
      if (!maybe.exists) return null;
      return maybe as Account<Subaccord>;
    },
    enabled: !!address,
    staleTime: 30_000,
  });
}
