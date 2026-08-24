/**
 * retune.ts — pure logic for the list authority's retuning flow
 * (ListDetailPage, accord-gou8 / ADR canon/0003).
 *
 * Two paths out of the list authority:
 *   authority ──(update_list)──► list params changed instantly (no timelock)
 *   authority ──(propose_court_update, CPI + 48h Accord timelock)──►
 *     PendingUpdate ──(execute_subaccord_update, permissionless)──► applied
 *
 * This module computes *who may retune* and parses one `Kind:value` court
 * payload with the canon-side bounds (Plurality pools only — no Median
 * cross-field gate). Pure + synchronous — no RPC, no React. Unit-tested
 * directly (retune.test.ts); mirrors the withdrawal.ts gating precedent and
 * the accord dApp's update.ts.
 */

import type { Address } from "@solana/kit";
import type { CanonList, UpdatePayload } from "@useaccord/canon";

import {
  MAX_APPEALS,
  MAX_DRAW_ATTEMPTS,
  MIN_APPEAL_WINDOW_SECS,
} from "@useaccord/sdk";

import { parseBigint, parseBoundedInt, requireAddress } from "./createForm";

/** One retunable court field: UI label + value hint + payload kind. */
export interface CourtUpdateField {
  kind: UpdatePayload["__kind"];
  label: string;
  hint: string;
}

/**
 * Every court field `propose_court_update` accepts. Deliberately EXCLUDES:
 * - `Authority` — canon rejects it (ForbiddenPayload): the court authority is
 *   pinned to the CanonList PDA forever.
 * - `min_jury_size` / `depth` — immutable on the Subaccord (not in
 *   UpdatePayload at all).
 */
export const COURT_UPDATE_FIELDS: readonly CourtUpdateField[] = [
  { kind: "MinStake", label: "Min stake", hint: "base units, > 0" },
  { kind: "AlphaBps", label: "Alpha (slash factor)", hint: "bps, 0–10000" },
  { kind: "ReviewWindow", label: "Review window", hint: "seconds, > 0" },
  { kind: "CommitWindow", label: "Commit window", hint: "seconds, > 0" },
  { kind: "RevealWindow", label: "Reveal window", hint: "seconds, > 0" },
  { kind: "AppealWindow", label: "Appeal window", hint: `seconds, ≥ ${MIN_APPEAL_WINDOW_SECS}` },
  { kind: "MaxAppeals", label: "Max appeals", hint: `0–${MAX_APPEALS}` },
  { kind: "FeePerJuror", label: "Fee per juror", hint: "base units, ≥ 0" },
  { kind: "EvidenceOperator", label: "Evidence operator", hint: "pubkey address" },
  { kind: "RevealThresholdBps", label: "Reveal threshold", hint: "bps, 0–10000" },
  { kind: "MaxDrawAttempts", label: "Max draw attempts", hint: `1–${MAX_DRAW_ATTEMPTS}` },
];

/**
 * `true` when the connected wallet may retune this list: it must be the
 * canon-side governance key (`CanonList.authority` — the creator at creation,
 * rotatable via `update_list`). Mirrors `canRequestWithdrawal`.
 */
export function canUpdateList(
  list: CanonList,
  connected: Address | null,
): boolean {
  if (connected === null) return false;
  return list.authority === connected;
}

/**
 * Parse a raw string value into a typed court `UpdatePayload` for `kind`,
 * applying the canon-side bounds (canon pools are always Plurality, so the
 * Median reveal-threshold gate never applies). Throws on bad input — the
 * panel surfaces the message. The on-chain guards stay the authority.
 */
export function parseCourtUpdateValue(
  kind: CourtUpdateField["kind"],
  raw: string,
): UpdatePayload {
  const label = COURT_UPDATE_FIELDS.find((f) => f.kind === kind)?.label ?? kind;
  switch (kind) {
    case "MinStake":
    case "ReviewWindow":
    case "CommitWindow":
    case "RevealWindow":
    case "FeePerJuror": {
      const payload: UpdatePayload = {
        __kind: kind,
        fields: [parseBigint(raw, label)],
      };
      // Canon's anti-brick mirror: a zero window is rejected on-chain
      // (WindowTooShort) — mirror client-side for fast feedback.
      if (
        (kind === "ReviewWindow" || kind === "CommitWindow" || kind === "RevealWindow") &&
        payload.fields[0] === 0n
      ) {
        throw new Error(`${label}: must be > 0 seconds.`);
      }
      return payload;
    }
    case "AppealWindow": {
      // Accord's floor — enforced at the propose CPI; mirror client-side.
      const secs = parseBigint(raw, label);
      if (secs < BigInt(MIN_APPEAL_WINDOW_SECS)) {
        throw new Error(`${label}: expected ≥ ${MIN_APPEAL_WINDOW_SECS} seconds.`);
      }
      return { __kind: kind, fields: [secs] };
    }
    case "AlphaBps":
      return { __kind: kind, fields: [parseBoundedInt(raw, label, 0, 10_000)] };
    case "MaxAppeals":
      return { __kind: kind, fields: [parseBoundedInt(raw, label, 0, MAX_APPEALS)] };
    case "RevealThresholdBps":
      return { __kind: kind, fields: [parseBoundedInt(raw, label, 0, 10_000)] };
    case "MaxDrawAttempts":
      return { __kind: kind, fields: [parseBoundedInt(raw, label, 1, MAX_DRAW_ATTEMPTS)] };
    case "EvidenceOperator":
      return { __kind: kind, fields: [requireAddress(raw, label)] };
    case "Authority":
      // Never offered (absent from COURT_UPDATE_FIELDS); canon rejects it
      // on-chain (ForbiddenPayload). Defense-in-depth for programmatic callers.
      throw new Error(
        "Authority is forbidden — the court authority is pinned to the list PDA.",
      );
  }
}


/**
 * Approximate wall-clock seconds until `executeAfterSlot` lands (~400ms/slot).
 * Display-only — the on-chain gate is the slot itself, not this estimate.
 */
export function timelockSecondsLeft(
  executeAfterSlot: bigint,
  currentSlot: bigint,
): number {
  return Number(executeAfterSlot - currentSlot) * 0.4;
}
