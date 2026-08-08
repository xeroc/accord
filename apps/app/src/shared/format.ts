import type { DisputeState } from "@useaccord/sdk";
import { DisputeState as DS } from "@useaccord/sdk";

export const DISPUTE_STATE_LABELS: Record<DisputeState, string> = {
  [DS.Created]: "Created",
  [DS.Drawn]: "Drawn",
  [DS.Review]: "Review",
  [DS.Commit]: "Commit",
  [DS.Reveal]: "Reveal",
  [DS.RoundResolved]: "Round resolved",
  [DS.Final]: "Final",
  [DS.Closed]: "Closed",
  [DS.Failed]: "Failed",
  [DS.RedrawEligible]: "Redraw eligible",
};

const FINAL_SENTINEL = 255;

export function formatRuling(ruling: number): string {
  if (ruling === FINAL_SENTINEL) return "—";
  return `Option ${ruling}`;
}

export function shortAddress(addr: string, head = 4, tail = 4): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
