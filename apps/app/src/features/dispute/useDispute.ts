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

import { createRpc, getCluster } from "../../shared/cluster";

export function useDispute(address: string | undefined) {
  return useQuery({
    queryKey: ["dispute", address, getCluster()],
    queryFn: async () => {
      if (!address) return null;
      const maybe = await fetchMaybeDispute(createRpc(), address as Address);
      if (!maybe.exists) return null;
      return maybe as Account<Dispute>;
    },
    enabled: !!address,
    staleTime: 15_000,
  });
}

export function useRound(dispute: Account<Dispute> | null | undefined) {
  return useQuery({
    queryKey: [
      "round",
      dispute?.address,
      dispute?.data.currentRound,
      getCluster(),
    ],
    queryFn: async () => {
      if (!dispute) return null;
      const [pda] = await findRoundPda({
        dispute: dispute.address,
        roundIdx: dispute.data.currentRound,
      });
      const maybe = await fetchMaybeRound(createRpc(), pda);
      if (!maybe.exists) return null;
      return maybe as Account<Round>;
    },
    enabled: !!dispute,
    staleTime: 15_000,
  });
}

export function useAppealBond(dispute: Account<Dispute> | null | undefined) {
  return useQuery({
    queryKey: [
      "appealBond",
      dispute?.address,
      dispute?.data.currentRound,
      getCluster(),
    ],
    queryFn: async () => {
      if (!dispute) return null;
      const [pda] = await findAppealBondPda({
        dispute: dispute.address,
        roundIdx: dispute.data.currentRound,
      });
      const maybe = await fetchMaybeAppealBond(createRpc(), pda);
      if (!maybe.exists) return null;
      return maybe as Account<AppealBond>;
    },
    enabled: !!dispute,
    staleTime: 15_000,
  });
}
