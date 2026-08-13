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
    <section className="detail-group">
      <h3 className="mono" style={{ color: "var(--amber)", marginBottom: "0.5rem" }}>
        Backing dispute
      </h3>
      <dl className="rows">
        <div className="row">
          <dt>Dispute</dt>
          <dd>{shortAddress(dispute.address as Address)}</dd>
        </div>
        <div className="row">
          <dt>State</dt>
          <dd>{stateLabel}</dd>
        </div>
        <div className="row">
          <dt>Round</dt>
          <dd>{d.currentRound}</dd>
        </div>
        <div className="row">
          <dt>Ruling</dt>
          <dd>{isFinal ? formatRuling(d.finalRuling, [...CANON_OPTION_LABELS]) : "pending"}</dd>
        </div>
        <div className="row">
          <dt>Filed</dt>
          <dd>{formatTimestamp(d.filedAt)}</dd>
        </div>
        {isFinal && (
          <div className="row">
            <dt>Finalized</dt>
            <dd>{formatTimestamp(d.finalizedAt)}</dd>
          </div>
        )}
      </dl>
      {deepLink ? (
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="back"
          style={{ display: "inline-block", marginTop: "0.75rem", color: "var(--amber)" }}
        >
          Open in Accord →
        </a>
      ) : (
        <p className="muted" style={{ margin: "0.75rem 0 0", fontSize: "0.8rem" }}>
          Set VITE_ACCORD_APP_URL to enable a deep link to the Accord dApp.
        </p>
      )}
      {!isFinal && (
        <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
          Once final, a cranker&rsquo;s settle_item applies the ruling here.
        </p>
      )}
    </section>
  );
}
