import { useQuery } from "@tanstack/react-query";
import { findAllDisputes } from "@useaccord/sdk";

import { createRpc, getCluster } from "../../shared/cluster";

export function useDisputes() {
  return useQuery({
    queryKey: ["disputes", getCluster()],
    queryFn: () => findAllDisputes(createRpc()),
    staleTime: 30_000,
  });
}
