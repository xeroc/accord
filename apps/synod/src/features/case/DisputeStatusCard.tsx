/**
 * DisputeStatusCard — inline, read-only Accord dispute status for a filed
 * Synod case (accord-9aoc; canon's DisputeStatusCard pattern).
 *
 * Thin adapter over the shared pattern (@useaccord/ui): keeps the bound
 * Accord `Dispute` decode (`SynodCase.dispute`) and Synod's dynamic option
 * labels — `option i` = party i (shortened), the neutral option sits at
 * index `party_count` (SPEC §Invariants 4) — plus the deep link to the
 * full dispute/voting view in the Accord dApp
 * (`VITE_ACCORD_APP_URL/#/disputes/:address`, new tab) — Synod never
 * reimplements voting.
 */

import { type Account, type Address } from "@solana/kit";
import { DisputeState, type Dispute } from "@useaccord/sdk";
import { DisputeStatusCard as DisputeStatusCardShell } from "@useaccord/ui";
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
    <DisputeStatusCardShell
      title="Backing dispute"
      rows={[
        {
          label: "Dispute",
          value: shortenAddress(dispute.address as Address, 6),
        },
        { label: "State", value: stateLabel },
        { label: "Round", value: d.currentRound },
        {
          label: "Ruling",
          value: isFinal ? formatRuling(d.finalRuling, optionLabels) : "pending",
        },
        { label: "Filed", value: formatTimestamp(d.filedAt) },
        ...(isFinal
          ? [{ label: "Finalized", value: formatTimestamp(d.finalizedAt) }]
          : []),
      ]}
      action={
        deepLink ? (
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm text-amber transition-colors hover:opacity-80"
          >
            Open in Accord →
          </a>
        ) : undefined
      }
      note={
        !deepLink && (
          <p
            className="mt-3 text-xs italic text-muted-foreground"
          >
            Set VITE_ACCORD_APP_URL to enable a deep link to the Accord dApp.
          </p>
        )
      }
    />
  );
}
