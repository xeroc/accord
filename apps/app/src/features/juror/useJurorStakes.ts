/**
 * useJurorStakes — every JurorStake owned by the connected wallet.
 *
 * Backs `/juror` (dashboard). Uses `findJurorStakesByJuror(rpc, address)` —
 * the typed GPA wrapper (no raw bytes). Returns `[]` when no wallet is
 * connected so the dashboard can render its empty state.
 */
import { useQuery } from "@tanstack/react-query";
import { type Account, type Address } from "@solana/kit";
import { type JurorStake, findJurorStakesByJuror } from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";

export function useJurorStakes(juror: Address | undefined) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["juror-stakes", juror, crpc?.endpoint],
    queryFn: () => findJurorStakesByJuror(crpc!.rpc, juror!),
    enabled: !!juror && !!crpc,
    staleTime: 20_000,
  });
}

/** Single JurorStake for a (subaccord, juror) pair — stake form + actions. */
export function useJurorStake(
  subaccord: Address | undefined,
  juror: Address | undefined,
) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["juror-stake", subaccord, juror, crpc?.endpoint],
    queryFn: async () => {
      if (!subaccord || !juror || !crpc) return null;
      const stakes = await findJurorStakesByJuror(crpc.rpc, juror);
      return (
        (stakes.find((s) => s.data.subaccord === subaccord) as
          Account<JurorStake> | undefined) ?? null
      );
    },
    enabled: !!subaccord && !!juror && !!crpc,
    staleTime: 15_000,
  });
}
