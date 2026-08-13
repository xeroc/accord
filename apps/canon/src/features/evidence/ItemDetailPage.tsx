/**
 * ItemDetailPage.tsx — minimal item detail view showing item state + evidence
 * manifest (when disputed). Full item lifecycle (submit, withdraw, etc.) is
 * E3's scope; this page only wires the evidence display.
 */
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "@solana/kit";
import { getCanonItemDecoder, ItemState } from "@useaccord/canon";
import { useClusterRpc } from "../../shared/rpc";
import { EvidenceManifest } from "./EvidenceManifest";

function stateLabel(state: ItemState): string {
  switch (state) {
    case ItemState.Pending: return "Pending";
    case ItemState.Listed: return "Listed";
    case ItemState.Disputed: return "Disputed";
    case ItemState.Removed: return "Removed";
    case ItemState.WithdrawPending: return "Withdraw Pending";
    default: return "Unknown";
  }
}

export function ItemDetailPage() {
  const { address } = useParams<{ address: string }>();
  const clusterRpc = useClusterRpc();

  const { data: item } = useQuery({
    queryKey: ["canon-item", address],
    queryFn: async () => {
      if (!address || !clusterRpc) return null;
      const res = await clusterRpc.rpc
        .getAccountInfo(address as Address, { encoding: "base64" })
        .send();
      if (!res.value) return null;
      return getCanonItemDecoder().decode(
        new Uint8Array(Buffer.from(res.value.data[0]!, "base64")),
      );
    },
    enabled: !!address && !!clusterRpc,
    retry: false,
    staleTime: 30_000,
  });

  if (!address) return <div className="p-6">No item address</div>;
  if (!clusterRpc) return <div className="p-6">Connecting…</div>;
  if (!item) return <div className="p-6">Loading item…</div>;

  const isDisputed = item.state === ItemState.Disputed;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        to="/"
        className="font-mono text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </Link>

      <h1 className="mt-4 font-heading text-xl font-semibold text-foreground">
        Item {address.slice(0, 8)}…
      </h1>

      <div className="mt-4 space-y-4">
        {/* Item state */}
        <div className="rounded-lg border border-border bg-card p-4">
          <dl className="grid grid-cols-2 gap-2 font-mono text-sm">
            <dt className="text-muted-foreground">State</dt>
            <dd className="text-right text-foreground">
              {stateLabel(item.state)}
            </dd>
            <dt className="text-muted-foreground">Account</dt>
            <dd className="truncate text-right text-foreground">
              {item.account}
            </dd>
            <dt className="text-muted-foreground">Stake</dt>
            <dd className="text-right text-foreground">
              {item.accumulatedStake.toString()}
            </dd>
          </dl>
        </div>

        {/* Evidence manifest (disputed items) */}
        {isDisputed && item.activeDispute && (
          <EvidenceManifest
            subaccord={item.list}
            dispute={item.activeDispute}
            round={0}
          />
        )}

        {/* Challenge button (only for non-disputed items) */}
        {!isDisputed && (
          <Link
            to={`/items/${address}/challenge`}
            className="inline-block rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
          >
            Challenge this item
          </Link>
        )}
      </div>
    </div>
  );
}
