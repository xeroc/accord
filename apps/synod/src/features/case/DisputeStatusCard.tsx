/**
 * DisputeStatusCard — inline, read-only Accord dispute status for a filed
 * Synod case (accord-9aoc; canon's DisputeStatusCard pattern).
 *
 * Decodes the bound Accord `Dispute` PDA (`SynodCase.dispute`) and renders its
 * state + final ruling. Synod option labels are dynamic: `option i` = party i
 * (shortened), the neutral option sits at index `party_count` (SPEC
 * §Invariants 4). Deep-links the full dispute/voting view in the Accord dApp
 * (`VITE_ACCORD_APP_URL/#/disputes/:address`, new tab) — Synod never
 * reimplements voting.
 */

import { type Account, type Address } from "@solana/kit";
import { DisputeState, type Dispute } from "@useaccord/sdk";
import {
  DISPUTE_STATE_LABELS,
  formatRuling,
  formatTimestamp,
  shortenAddress,
} from "@/shared/format";

const ACCORD_APP_URL = import.meta.env.VITE_ACCORD_APP_URL ?? "";

export function DisputeStatusCard({
  dispute,
  optionLabels,
}: {
  dispute: Account<Dispute>;
  /** Roster-order labels: party i at i, neutral at party_count. */
  optionLabels: string[];
}) {
  const d = dispute.data;
  const isFinal =
    d.state === DisputeState.Final || d.state === DisputeState.Closed;
  const stateLabel = DISPUTE_STATE_LABELS[d.state] ?? "Unknown";
  const deepLink = ACCORD_APP_URL
    ? `${ACCORD_APP_URL.replace(/\/$/, "")}/#/disputes/${dispute.address}`
    : "";

  return (
    <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <h3
        className="font-mono text-sm"
        style={{ color: "var(--amber)", marginBottom: "0.5rem" }}
      >
        Backing dispute
      </h3>
      <dl className="grid gap-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">Dispute</dt>
          <dd className="text-right">
            {shortenAddress(dispute.address as Address, 6)}
          </dd>
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
          <dd className="text-right">
            {isFinal ? formatRuling(d.finalRuling, optionLabels) : "pending"}
          </dd>
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
          className="text-sm transition-colors hover:text-foreground"
          style={{ display: "inline-block", marginTop: "0.75rem", color: "var(--amber)" }}
        >
          Open in Accord →
        </a>
      ) : (
        <p
          className="italic text-muted-foreground"
          style={{ margin: "0.75rem 0 0", fontSize: "0.8rem" }}
        >
          Set VITE_ACCORD_APP_URL to enable a deep link to the Accord dApp.
        </p>
      )}
    </section>
  );
}
