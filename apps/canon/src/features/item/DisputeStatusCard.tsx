/**
 * DisputeStatusCard — inline, read-only Accord dispute status for a Disputed
 * Canon item (accord-gg8f; milestone architecture decision #7).
 *
 * Decodes the Accord `Dispute` PDA backing the item (`CanonItem.activeDispute`)
 * and renders its state + final ruling (canon options are the fixed
 * `[keep, remove]` pair). Deep-links the full dispute/voting view in the Accord
 * dApp (`VITE_ACCORD_APP_URL/#/disputes/:address`, new tab) — Canon never
 * reimplements voting. `settle_item` (which reads the ruling back into Canon)
 * is a cranker-owned crank, not an action here.
 */

import { type Account, type Address } from "@solana/kit";
import { DisputeState, type Dispute } from "@useaccord/sdk";
import {
  DISPUTE_STATE_LABELS,
  formatRuling,
  formatTimestamp,
  shortAddress,
} from "@/shared/format";

/** Canon's dispute options are fixed (SPEC §Instructions #4): index 0/1. */
const CANON_OPTION_LABELS = ["keep", "remove"] as const;

const ACCORD_APP_URL = import.meta.env.VITE_ACCORD_APP_URL ?? "";

export function DisputeStatusCard({ dispute }: { dispute: Account<Dispute> }) {
  const d = dispute.data;
  const isFinal = d.state === DisputeState.Final || d.state === DisputeState.Closed;
  const stateLabel = DISPUTE_STATE_LABELS[d.state] ?? "Unknown";
  const deepLink = ACCORD_APP_URL
    ? `${ACCORD_APP_URL.replace(/\/$/, "")}/#/disputes/${dispute.address}`
    : "";

  return (
    <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="font-mono text-sm text-foreground" style={{ color: "var(--amber)", marginBottom: "0.5rem" }}>
        Backing dispute
      </h3>
      <dl className="grid gap-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">Dispute</dt>
          <dd className="text-right">{shortAddress(dispute.address as Address)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">State</dt>
          <dd className="text-right">{stateLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">Round</dt>
          <dd className="text-right">{d.currentRound}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">Ruling</dt>
          <dd className="text-right">{isFinal ? formatRuling(d.finalRuling, [...CANON_OPTION_LABELS]) : "pending"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">Filed</dt>
          <dd className="text-right">{formatTimestamp(d.filedAt)}</dd>
        </div>
        {isFinal && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">Finalized</dt>
            <dd className="text-right">{formatTimestamp(d.finalizedAt)}</dd>
          </div>
        )}
      </dl>
      {deepLink ? (
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          style={{ display: "inline-block", marginTop: "0.75rem", color: "var(--amber)" }}
        >
          Open in Accord →
        </a>
      ) : (
        <p className="italic text-muted-foreground" style={{ margin: "0.75rem 0 0", fontSize: "0.8rem" }}>
          Set VITE_ACCORD_APP_URL to enable a deep link to the Accord dApp.
        </p>
      )}
      {!isFinal && (
        <p className="italic text-muted-foreground" style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
          Once final, a cranker&rsquo;s settle_item applies the ruling here.
        </p>
      )}
    </section>
  );
}
