/**
 * DisputeStatusCard — inline, read-only Accord dispute status for a Disputed
 * Canon item (accord-gg8f; milestone architecture decision #7).
 *
 * Thin adapter over the shared pattern (@useaccord/ui): keeps the Accord
 * `Dispute` decode (`CanonItem.activeDispute`), Canon's fixed
 * `[keep, remove]` ruling labels, and the deep link to the full
 * dispute/voting view in the Accord dApp
 * (`VITE_ACCORD_APP_URL/#/disputes/:address`, new tab) — Canon never
 * reimplements voting. `settle_item` (which reads the ruling back into
 * Canon) is a cranker-owned crank, not an action here.
 */

import { type Account, type Address } from "@solana/kit";
import { DisputeState, type Dispute } from "@useaccord/sdk";
import { DisputeStatusCard as DisputeStatusCardShell } from "@useaccord/ui";
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
    <DisputeStatusCardShell
      title="Backing dispute"
      rows={[
        { label: "Dispute", value: shortAddress(dispute.address as Address) },
        { label: "State", value: stateLabel },
        { label: "Round", value: d.currentRound },
        {
          label: "Ruling",
          value: isFinal
            ? formatRuling(d.finalRuling, [...CANON_OPTION_LABELS])
            : "pending",
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
        <>
          {!deepLink && (
            <p className="mt-3 text-xs italic text-muted-foreground">
              Set VITE_ACCORD_APP_URL to enable a deep link to the Accord dApp.
            </p>
          )}
          {!isFinal && (
            <p className="mt-2 text-xs italic text-muted-foreground">
              Once final, a cranker&rsquo;s settle_item applies the ruling here.
            </p>
          )}
        </>
      }
    />
  );
}
