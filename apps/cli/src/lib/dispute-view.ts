/**
 * Pure view over a decoded Dispute account — the `dispute:show` rendering
 * seam. Interprets the wire sentinels the raw `read:dispute` dump leaves
 * opaque: state enum → name, `u64::MAX` ruling → null, `[0u8;32]` evidence →
 * null, unix-seconds → ISO, `Option` VRF → hex. No I/O, no chain.
 */
import type { ReadonlyUint8Array } from "@solana/kit";

import {
  Aggregation,
  DisputeState,
  NO_RULING,
  ShortfallPolicy,
  type Dispute,
} from "@useaccord/sdk";

import { groupBigInt, isoFromUnixSeconds } from "./format.js";

/** `[0u8;32]` — "no new evidence this round" sentinel (ADR-0023). */
export const ZERO_HASH = new Uint8Array(32);

export interface DisputeView {
  subaccord: string;
  filer: string;
  nonce: string;
  state: string;
  currentRound: number;
  drawnSeats: number;
  numOptions: number;
  options: Array<string | null>;
  evidenceHashes: Array<string | null>;
  terms: {
    alphaBps: number;
    minStake: string;
    feePerJuror: string;
    reviewWindow: string;
    commitWindow: string;
    revealWindow: string;
    appealWindow: string;
    maxAppeals: number;
    minJurySize: number;
    aggregation: string;
    revealThresholdBps: number;
    shortfallPolicy: string;
    maxDrawAttempts: number;
    coherenceTolBps: number;
  };
  feePaid: string;
  bountyPool: string;
  committedVrf: string | null;
  frozenRoot: string | null;
  frozenTotalStake: string;
  filedAt: string;
  filedAtIso: string | null;
  finalRuling: string | null;
  rulingLabel: string | null;
  finalizedAt: string | null;
  finalizedAtIso: string | null;
  bump: number;
}

function hashOrSentinel(bytes: ReadonlyUint8Array): string | null {
  return bytes.every((b) => b === 0) ? null : Buffer.from(bytes).toString("hex");
}

function optionHex(v: Dispute["committedVrf"]): string | null {
  return v.__option === "Some" ? Buffer.from(v.value).toString("hex") : null;
}

export function disputeView(d: Dispute): DisputeView {
  const ruling = d.finalRuling === NO_RULING ? null : d.finalRuling;
  const aggregation = Aggregation[d.terms.aggregation];
  return {
    subaccord: d.subaccord,
    filer: d.filer,
    nonce: groupBigInt(d.nonce),
    state: DisputeState[d.state],
    currentRound: d.currentRound,
    drawnSeats: d.drawnSeats,
    numOptions: d.numOptions,
    options: d.options.map(hashOrSentinel),
    evidenceHashes: d.evidenceHashes.map(hashOrSentinel),
    terms: {
      alphaBps: d.terms.alphaBps,
      minStake: groupBigInt(d.terms.minStake),
      feePerJuror: groupBigInt(d.terms.feePerJuror),
      reviewWindow: groupBigInt(d.terms.reviewWindow),
      commitWindow: groupBigInt(d.terms.commitWindow),
      revealWindow: groupBigInt(d.terms.revealWindow),
      appealWindow: groupBigInt(d.terms.appealWindow),
      maxAppeals: d.terms.maxAppeals,
      minJurySize: d.terms.minJurySize,
      aggregation,
      revealThresholdBps: d.terms.revealThresholdBps,
      shortfallPolicy: ShortfallPolicy[d.terms.shortfallPolicy],
      maxDrawAttempts: d.terms.maxDrawAttempts,
      coherenceTolBps: d.terms.coherenceTolBps,
    },
    feePaid: groupBigInt(d.feePaid),
    bountyPool: groupBigInt(d.bountyPool),
    committedVrf: optionHex(d.committedVrf),
    // [0;32] until the VRF callback freezes it (ADR-0012).
    frozenRoot: hashOrSentinel(d.frozenRoot),
    frozenTotalStake: groupBigInt(d.frozenTotalStake),
    filedAt: groupBigInt(d.filedAt),
    filedAtIso: isoFromUnixSeconds(d.filedAt),
    finalRuling: ruling === null ? null : String(ruling),
    rulingLabel:
      ruling === null
        ? null
        : aggregation === "Median"
          ? `${groupBigInt(ruling)} (median scalar, base units — ADR-0025)`
          : `${ruling} (option index)`,
    finalizedAt: d.finalizedAt === 0n ? null : groupBigInt(d.finalizedAt),
    finalizedAtIso: d.finalizedAt === 0n ? null : isoFromUnixSeconds(d.finalizedAt),
    bump: d.bump,
  };
}

/** Human lines — field-name labels, full values, grouped numbers, ISO times. */
export function renderDisputeHuman(v: DisputeView): string[] {
  const options = v.options
    .map((o, i) => (o ? `#${i} ${o.slice(0, 8)}…` : null))
    .filter(Boolean)
    .join(", ");
  const evidence = v.evidenceHashes
    .map((h, r) => (h ? `round ${r}: ${h.slice(0, 8)}…` : null))
    .filter(Boolean)
    .join(", ");
  return [
    `subaccord      : ${v.subaccord}`,
    `filer          : ${v.filer}`,
    `nonce          : ${v.nonce}`,
    `state          : ${v.state}`,
    `currentRound   : ${v.currentRound} (drawnSeats ${v.drawnSeats}/${v.terms.minJurySize})`,
    `numOptions     : ${v.numOptions}${options ? ` — ${options}` : ""}`,
    `evidenceHashes : ${evidence || "none"}`,
    `filedAt        : ${v.filedAtIso ?? v.filedAt}`,
    `committedVrf   : ${v.committedVrf ?? "— (not yet committed)"}`,
    `frozenRoot     : ${v.frozenRoot ?? "— (not yet frozen)"}`,
    `frozenTotalStake : ${v.frozenTotalStake}`,
    `feePaid        : ${v.feePaid}`,
    `bountyPool     : ${v.bountyPool}`,
    `finalRuling    : ${v.rulingLabel ?? "— (not final yet)"}`,
    `finalizedAt    : ${v.finalizedAtIso ?? "—"}`,
    `terms          :`,
    `  alphaBps ${v.terms.alphaBps} · minStake ${v.terms.minStake} · feePerJuror ${v.terms.feePerJuror}`,
    `  windows: review ${v.terms.reviewWindow}s · commit ${v.terms.commitWindow}s · reveal ${v.terms.revealWindow}s · appeal ${v.terms.appealWindow}s`,
    `  maxAppeals ${v.terms.maxAppeals} · minJurySize ${v.terms.minJurySize} · aggregation ${v.terms.aggregation}`,
    `  revealThresholdBps ${v.terms.revealThresholdBps} · shortfallPolicy ${v.terms.shortfallPolicy} · maxDrawAttempts ${v.terms.maxDrawAttempts} · coherenceTolBps ${v.terms.coherenceTolBps}`,
    `bump           : ${v.bump}`,
  ];
}
