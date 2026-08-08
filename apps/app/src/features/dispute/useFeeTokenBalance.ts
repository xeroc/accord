import { useQuery } from "@tanstack/react-query";
import { type Address } from "@solana/kit";

import { useClusterRpc } from "../../shared/rpc";
import { getAtaAddress } from "../../shared/tokens";

/**
 * Balance of the connected wallet's ATA for the Subaccord's `fee_token`.
 *
 * Returns the raw token amount as a bigint (matching how `requiredFee` is
 * expressed), or `0n` if the ATA doesn't exist yet. `null` while loading.
 *
 * ponytail: one JSON-RPC call (`getTokenAccountBalance`) instead of decoding
 * the Token account — we only need the amount, not the account struct.
 */
export function useFeeTokenBalance(
  owner: Address | undefined,
  feeToken: Address | undefined,
) {
  const crpc = useClusterRpc();
  return useQuery({
    queryKey: ["fee-token-balance", owner, feeToken, crpc?.endpoint],
    queryFn: async (): Promise<bigint> => {
      if (!owner || !feeToken || !crpc) return 0n;
      const ata = await getAtaAddress(owner, feeToken);
      try {
        const res = await crpc.rpc.getTokenAccountBalance(ata).send();
        return BigInt(res.value.amount);
      } catch {
        // Token account not found / not initialised.
        return 0n;
      }
    },
    enabled: !!owner && !!feeToken && !!crpc,
    staleTime: 15_000,
  });
}
