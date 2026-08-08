import { useQuery } from "@tanstack/react-query";
import { type Account, type Address } from "@solana/kit";
import {
  type AppealBond,
  type Dispute,
  type Round,
  fetchMaybeAppealBond,
  fetchMaybeDispute,
  fetchMaybeRound,
  findAppealBondPda,
  findRoundPda,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";

export function useDispute(address: string | undefined) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["dispute", address, crpc?.endpoint],
    queryFn: async () => {
      if (!address || !crpc) return null;
      const maybe = await fetchMaybeDispute(crpc.rpc, address as Address);
      if (!maybe.exists) return null;
      return maybe as Account<Dispute>;
    },
    enabled: !!address && !!crpc,
    staleTime: 15_000,
  });
}

export function useRound(dispute: Account<Dispute> | null | undefined) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: [
      "round",
      dispute?.address,
      dispute?.data.currentRound,
      crpc?.endpoint,
    ],
    queryFn: async () => {
      if (!dispute || !crpc) return null;
      const [pda] = await findRoundPda({
        dispute: dispute.address,
        roundIdx: dispute.data.currentRound,
      });
      const maybe = await fetchMaybeRound(crpc.rpc, pda);
      if (!maybe.exists) return null;
      return maybe as Account<Round>;
    },
    enabled: !!dispute && !!crpc,
    staleTime: 15_000,
  });
}

export function useAppealBond(dispute: Account<Dispute> | null | undefined) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: [
      "appealBond",
      dispute?.address,
      dispute?.data.currentRound,
      crpc?.endpoint,
    ],
    queryFn: async () => {
      if (!dispute || !crpc) return null;
      const [pda] = await findAppealBondPda({
        dispute: dispute.address,
        roundIdx: dispute.data.currentRound,
      });
      const maybe = await fetchMaybeAppealBond(crpc.rpc, pda);
      if (!maybe.exists) return null;
      return maybe as Account<AppealBond>;
    },
    enabled: !!dispute && !!crpc,
    staleTime: 15_000,
  });
}
