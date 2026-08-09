/**
 * useTokenMeta — resolve `decimals` + `symbol` for an SPL mint.
 *
 * Two-tier:
 *   1. `MINT_OVERRIDES` from `@tributary-so/tokens-client` — instant for
 *      well-known mints (USDC, SOL, USDT, mSOL). No RPC call.
 *   2. On-chain SPL Mint decode — read byte 44 (decimals) from the raw
 *      82-byte Mint account. One `getAccountInfo` call, cached by react-query.
 *
 * Returns `{ decimals, symbol }` or `null` while loading / on error. Callers
 * fall back to raw atomic formatting when `decimals` is unknown.
 */
import { useQuery } from "@tanstack/react-query";
import { type Address } from "@solana/kit";
import {
  MINT_OVERRIDES,
  lookupOverride,
  type TokenMetadata,
} from "@tributary-so/tokens-client";

import { useClusterRpc } from "./rpc";

export interface TokenMeta {
  decimals: number;
  symbol: string;
}

/** Build a TokenMeta from the static override map, or return null. */
function fromOverride(mint: Address): TokenMeta | null {
  const o: TokenMetadata | null = lookupOverride(mint);
  if (o?.decimals !== undefined) {
    return { decimals: o.decimals, symbol: o.symbol ?? "???" };
  }
  return null;
}

export function useTokenMeta(mint: Address | undefined) {
  const crpc = useClusterRpc();
  return useQuery<TokenMeta | null>({
    queryKey: ["token-meta", mint, crpc?.endpoint],
    queryFn: async () => {
      if (!mint || !crpc) return null;

      // Tier 1: static override (instant — no RPC).
      const cached = fromOverride(mint);
      if (cached) return cached;

      // Tier 2: decode the on-chain SPL Mint account.
      // Layout (Token program, 82 bytes): decimals is at byte offset 44.
      const res = await crpc.rpc
        .getAccountInfo(mint, { encoding: "base64" })
        .send();
      if (!res.value) return null;
      const [data] = res.value.data;
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      if (bytes.length < 45) return null;
      const decimals = bytes[44]!;
      return { decimals, symbol: mint.slice(0, 4) + "…" };
    },
    enabled: !!mint && !!crpc,
    staleTime: 5 * 60_000, // mint config doesn't change
  });
}

export { MINT_OVERRIDES };
