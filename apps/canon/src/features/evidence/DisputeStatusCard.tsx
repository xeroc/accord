/**
 * DisputeStatusCard.tsx — inline read-only dispute status for a disputed Canon
 * item. Decodes the backing Accord Dispute PDA (CanonItem.active_dispute) via
 * raw-RPC read + @useaccord/sdk decoders. Shows phase, round, and final ruling.
 * Deep-links to the Accord app's dispute detail page (new tab).
 *
 * Canon never reimplements voting — this card is read-only (milestone §7).
 */
import { useQuery } from "@tanstack/react-query";
import type { Address } from "@solana/kit";
import { getDisputeDecoder, DisputeState } from "@useaccord/sdk";
import { useClusterRpc } from "../../shared/rpc";

/** Final-ruling sentinel — no ruling yet (u64::MAX, ADR-0025). */
const NO_RULING = 0xffff_ffff_ffff_ffffn;

/** Canon-fixed option labels for ruling display. */
const CANON_RULING_LABELS = ["keep", "remove"];

const ACCORD_APP_URL =
  import.meta.env.VITE_ACCORD_APP_URL ?? "https://accord.pages.dev";

function stateLabel(state: DisputeState): string {
  const labels: Record<number, string> = {
    [DisputeState.Created]: "Created",
    [DisputeState.Drawn]: "Drawn",
    [DisputeState.Review]: "Review",
    [DisputeState.Commit]: "Commit",
    [DisputeState.Reveal]: "Reveal",
    [DisputeState.RoundResolved]: "Round Resolved",
    [DisputeState.Final]: "Final",
    [DisputeState.Closed]: "Closed",
    [DisputeState.Failed]: "Failed",
    [DisputeState.RedrawEligible]: "Redraw Eligible",
  };
  return labels[state] ?? "Unknown";
}

export function DisputeStatusCard({
  disputeAddress,
}: {
  disputeAddress: string;
}) {
  const clusterRpc = useClusterRpc();

  const { data: dispute, isLoading, error } = useQuery({
    queryKey: ["accord-dispute", disputeAddress],
    queryFn: async () => {
      if (!clusterRpc) return null;
      const res = await clusterRpc.rpc
        .getAccountInfo(disputeAddress as Address, { encoding: "base64" })
        .send();
      if (!res.value) return null;
      return getDisputeDecoder().decode(
        new Uint8Array(Buffer.from(res.value.data[0]!, "base64")),
      );
    },
    enabled: !!clusterRpc,
    retry: false,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-mono text-sm text-muted-foreground">
          Loading dispute…
        </p>
      </div>
    );
  }

  if (error || !dispute) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-card p-4">
        <p className="font-mono text-sm text-destructive">
          {error ? `Failed to load dispute: ${error.message}` : "Dispute account not found"}
        </p>
      </div>
    );
  }

  const isFinal = dispute.state === DisputeState.Final;
  const hasRuling = isFinal && dispute.finalRuling !== NO_RULING;
  const rulingIdx = hasRuling ? Number(dispute.finalRuling) : undefined;
  const rulingLabel =
    rulingIdx !== undefined && rulingIdx < CANON_RULING_LABELS.length
      ? CANON_RULING_LABELS[rulingIdx]
      : undefined;

  const accordUrl = `${ACCORD_APP_URL}/#/disputes/${disputeAddress}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Dispute Status
        </h3>
        <a
          href={accordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-amber hover:underline"
        >
          View in Accord ↗
        </a>
      </div>

      <dl className="grid grid-cols-2 gap-2 font-mono text-sm">
        <dt className="text-muted-foreground">Phase</dt>
        <dd className={`text-right ${isFinal ? "text-confirm" : "text-amber"}`}>
          {stateLabel(dispute.state)}
        </dd>

        <dt className="text-muted-foreground">Round</dt>
        <dd className="text-right text-foreground">
          {dispute.currentRound}
        </dd>

        {hasRuling && rulingLabel && (
          <>
            <dt className="text-muted-foreground">Final ruling</dt>
            <dd className={`text-right font-semibold ${
              rulingLabel === "keep" ? "text-confirm" : "text-destructive"
            }`}>
              {rulingLabel}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-3 border-t border-border pt-2 font-mono text-xs text-muted-foreground">
        Dispute {disputeAddress.slice(0, 8)}…
      </div>
    </div>
  );
}
