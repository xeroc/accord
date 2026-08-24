/**
 * update.ts — pure logic for the authority's parameter-update flow
 * (SubaccordDetailPage, accord-7s0n / ADR-0028).
 *
 * The update path (SPEC §Instructions #2):
 *   authority ──(propose_subaccord_update, 48h timelock)──► PendingUpdate
 *             ──(execute_subaccord_update, permissionless)──► applied
 *
 * This module computes *who may propose* and parses one `Kind:value` payload
 * with the same domain bounds the create form enforces (createForm.ts parsers,
 * shared with on-chain `validate_update_payload`). Pure + synchronous — no
 * RPC, no React. Unit-tested directly (update.test.ts); mirrors canon's
 * withdrawal.ts gating precedent.
 */

import type { Address } from "@solana/kit";
import { Aggregation, type UpdatePayload } from "@useaccord/sdk";

import { MAX_APPEALS, MAX_DRAW_ATTEMPTS, MIN_APPEAL_WINDOW_SECS } from "@useaccord/sdk";
import { parseBigint, parseBoundedInt, requireAddress } from "./createForm";

/** `Pubkey::default()` — on-chain sentinel for "no authority" (immutable
 * Subaccord). Local copy so this module stays importable from node tests
 * (shared/wallet pulls in ConnectorKit). Keep in sync with shared/wallet.ts. */
export const ZERO_ADDRESS = "11111111111111111111111111111111" as Address;

/** Minimal decoded view the gating + parsing logic needs (structural — the
 * full `SubaccordView` satisfies it). */
export interface UpdateAuthorityView {
  authority: Address;
  aggregation: Aggregation;
}

/**
 * `true` when the connected wallet may propose an update on this Subaccord:
 * a real authority must be set (`Pubkey::default()` = immutable, ADR-0005)
 * and the connected wallet must BE that authority. Mirrors canon's
 * `canRequestWithdrawal` gating.
 */
export function canUpdateSubaccord(
  subaccord: { authority: Address },
  connected: Address | null,
): boolean {
  if (connected === null) return false;
  return subaccord.authority !== ZERO_ADDRESS && subaccord.authority === connected;
}

/** One mutable field: UI label + value hint + parser kind. */
export interface UpdateField {
  kind: UpdatePayload["__kind"];
  label: string;
  hint: string;
}

/** Every `UpdatePayload` variant (SPEC §Instructions #2, ADR-0028). */
export const UPDATE_FIELDS: readonly UpdateField[] = [
  { kind: "MinStake", label: "Min stake", hint: "base units, > 0" },
  { kind: "AlphaBps", label: "Alpha (slash factor)", hint: "bps, 0–10000" },
  { kind: "ReviewWindow", label: "Review window", hint: "seconds, > 0" },
  { kind: "CommitWindow", label: "Commit window", hint: "seconds, > 0" },
  { kind: "RevealWindow", label: "Reveal window", hint: "seconds, > 0" },
  { kind: "AppealWindow", label: "Appeal window", hint: `seconds, ≥ ${MIN_APPEAL_WINDOW_SECS}` },
  { kind: "MaxAppeals", label: "Max appeals", hint: `0–${MAX_APPEALS}` },
  { kind: "FeePerJuror", label: "Fee per juror", hint: "base units, ≥ 0" },
  { kind: "Authority", label: "Authority", hint: "pubkey address" },
  { kind: "EvidenceOperator", label: "Evidence operator", hint: "pubkey address" },
  { kind: "RevealThresholdBps", label: "Reveal threshold", hint: "bps, 0–10000 (> 0 on Median)" },
  { kind: "MaxDrawAttempts", label: "Max draw attempts", hint: `1–${MAX_DRAW_ATTEMPTS}` },
];

/**
 * Parse a raw string value into a typed `UpdatePayload` for `kind`, applying
 * the same domain bounds as on-chain `validate_update_payload` (+ the
 * `RevealThresholdBps > 0` Median cross-field gate, SR2-M-1). Throws on bad
 * input — the dialog surfaces the message.
 */
export function parseUpdateValue(
  kind: UpdateField["kind"],
  raw: string,
  aggregation: Aggregation,
): UpdatePayload {
  switch (kind) {
    case "MinStake":
    case "ReviewWindow":
    case "CommitWindow":
    case "RevealWindow":
    case "FeePerJuror":
      return { __kind: kind, fields: [parseBigint(raw, labelFor(kind))] };
    case "AppealWindow": {
      // ADR-0022 floor — the update path enforces it at propose; mirror
      // client-side so the dialog rejects before signing.
      const secs = parseBigint(raw, labelFor(kind));
      if (secs < BigInt(MIN_APPEAL_WINDOW_SECS)) {
        throw new Error(
          `${labelFor(kind)}: expected ≥ ${MIN_APPEAL_WINDOW_SECS} seconds.`,
        );
      }
      return { __kind: kind, fields: [secs] };
    }
    case "AlphaBps":
      return {
        __kind: kind,
        fields: [parseBoundedInt(raw, labelFor(kind), 0, 10_000)],
      };
    case "MaxAppeals":
      return {
        __kind: kind,
        fields: [parseBoundedInt(raw, labelFor(kind), 0, MAX_APPEALS)],
      };
    case "RevealThresholdBps": {
      // SR2-M-1 parity: a Median pool cannot drop to a zero reveal threshold
      // (create_subaccord gate, mirrored in validate_update_cross_field).
      const min = aggregation === Aggregation.Median ? 1 : 0;
      return {
        __kind: kind,
        fields: [parseBoundedInt(raw, labelFor(kind), min, 10_000)],
      };
    }
    case "MaxDrawAttempts":
      return {
        __kind: kind,
        fields: [parseBoundedInt(raw, labelFor(kind), 1, MAX_DRAW_ATTEMPTS)],
      };
    case "Authority":
    case "EvidenceOperator":
      return { __kind: kind, fields: [requireAddress(raw, labelFor(kind))] };
  }
}

function labelFor(kind: UpdateField["kind"]): string {
  return UPDATE_FIELDS.find((f) => f.kind === kind)?.label ?? kind;
}

/**
 * Approximate wall-clock seconds until `executeAfterSlot` lands, from a slot
 * delta (~400ms/slot mainnet). Display-only — the on-chain gate is the slot
 * itself, not this estimate.
 */
export function timelockSecondsLeft(
  executeAfterSlot: bigint,
  currentSlot: bigint,
): number {
  return Number(executeAfterSlot - currentSlot) * 0.4;
}
