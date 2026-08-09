import { useQuery } from "@tanstack/react-query";
import { findAllDisputes } from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";

export function useDisputes() {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["disputes", crpc?.endpoint],
    queryFn: () => findAllDisputes(crpc!.rpc),
    enabled: !!crpc,
    staleTime: 30_000,
  });
}
