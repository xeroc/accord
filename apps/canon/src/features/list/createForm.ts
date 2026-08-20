/**
 * createForm.ts — pure logic for the create-list form (CreateListPage).
 *
 * Extracted from the page so it is node-testable (decision #8: no zod, no
 * react-hook-form — parse on submit, throw on bad input; the page surfaces
 * the message). Domain identity follows the ADR-0027 amendment (create-first
 * write path): default = author the rules doc in-form (template prefill) and
 * hash it client-side (`rules_hash = sha256(doc)` — no manual random hex);
 * advanced = paste an existing doc's hash. Also owns the post-confirm
 * publish state machine (pending/published/failed→retry) — publish failure ≠
 * creation failure; the doc reaches the daemon CAS after `create_list`
 * confirms, anchored on the backing Subaccord (`domain_ref := rules_hash`).
 */
import type { Address } from "@solana/kit";
import { hashDomainDoc } from "@useaccord/sdk";
import { DOMAIN_DOC_TEMPLATE } from "@useaccord/ui";

/** How the form sources the rules identity (ADR-0027 amendment). */
export type DomainMode = "author" | "reference";

/** String-valued form state — every input is text; parsed on submit. */
export interface FormState {
  /** author: write the doc in-form (template prefill) → hash client-side.
   * reference: paste an existing doc's 64-hex hash (`rulesHash`). */
  domainMode: DomainMode;
  /** Raw rules-doc text (author mode) — frontmatter + markdown criteria. */
  rulesDoc: string;
  rulesHash: string; // reference mode: pasted 64-hex hash
  stakeMint: string;
  feeMint: string;
  listProgram: string;
  submitDeposit: string;
  challengePct: string;
  listingWindow: string;
  withdrawalTimelock: string;
}

/** Canon canonical defaults (mirror programs/canon/constants.rs). */
export const DEFAULT_SUBMIT_DEPOSIT = "500";
export const DEFAULT_CHALLENGE_PCT_BPS = "5000";
export const FIVE_DAYS_SECS = (5 * 24 * 60 * 60).toString();
export const MAX_CHALLENGE_PCT_BPS = 10_000;

export const DEFAULTS: FormState = {
  domainMode: "author",
  rulesDoc: DOMAIN_DOC_TEMPLATE,
  rulesHash: "",
  stakeMint: "",
  feeMint: "",
  listProgram: "",
  submitDeposit: DEFAULT_SUBMIT_DEPOSIT,
  challengePct: DEFAULT_CHALLENGE_PCT_BPS,
  listingWindow: FIVE_DAYS_SECS,
  withdrawalTimelock: FIVE_DAYS_SECS,
};

/** Doc bytes hashed/published for the form (author mode): UTF-8 of the text. */
export function docBytes(form: FormState): Uint8Array {
  return new TextEncoder().encode(form.rulesDoc);
}

/** The rules-hash hex the form will put on chain: `sha256(doc)` in author
 * mode (live — recomputed as the doc is edited), the pasted hash in
 * reference mode (validated at `buildArgs`). */
export function rulesHashHex(form: FormState): string {
  if (form.domainMode === "reference") return form.rulesHash.trim();
  return hashDomainDoc(docBytes(form));
}

/** Parsed create-list args (the canon-SDK `CreateListArgs` shape minus the
 * deployment-configured evidence operator and court profile, which the page
 * supplies). Throws on bad input — the submit handler surfaces the message. */
export function buildArgs(form: FormState): {
  listProgram: Address;
  rulesHash: Uint8Array;
  submitDeposit: bigint;
  challengePct: number;
  listingWindow: bigint;
  withdrawalTimelock: bigint;
} {
  return {
    listProgram: (form.listProgram.trim() || SYSTEM_PROGRAM_ID) as Address,
    rulesHash: parseHex32(rulesHashHex(form), "Rules hash"),
    submitDeposit: parseBigint(form.submitDeposit, "Submit deposit"),
    challengePct: parseBoundedInt(
      form.challengePct,
      "Challenge pct",
      0,
      MAX_CHALLENGE_PCT_BPS,
    ),
    listingWindow: parseBigint(form.listingWindow, "Listing window"),
    withdrawalTimelock: parseBigint(
      form.withdrawalTimelock,
      "Withdrawal timelock",
    ),
  };
}

// --- parse + validate ---------------------------------------------------------

/** `Pubkey::default()` — System Program; the sentinel that disables the
 * ownership check (curate arbitrary base58 data). */
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

/** Parse a 64-char hex string into `Uint8Array(32)`. 0x prefix optional. */
export function parseHex32(input: string, label: string): Uint8Array {
  const hex = input.startsWith("0x") ? input.slice(2) : input;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `${label}: expected 64 hex chars (32 bytes), got "${input}".`,
    );
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function parseBigint(input: string, label: string): bigint {
  const v = input.trim();
  if (!/^\d+$/.test(v))
    throw new Error(`${label}: expected a non-negative integer.`);
  return BigInt(v);
}

function parseBoundedInt(
  input: string,
  label: string,
  min: number,
  max: number,
): number {
  const v = input.trim();
  if (!/^-?\d+$/.test(v)) throw new Error(`${label}: expected an integer.`);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${label}: expected ${min}–${max}, got ${n}.`);
  }
  return n;
}

export function requireAddress(input: string, label: string): Address {
  const v = input.trim();
  if (!v) throw new Error(`${label}: address required.`);
  return v as Address;
}

// --- post-confirm publish state machine (ADR-0027 amendment) -----------------

/**
 * Publish lifecycle after the create-list tx CONFIRMS (create-first): the
 * CanonList + backing Subaccord exist on-chain with `domain_ref =
 * rules_hash = sha256(doc)`; the doc bytes still have to reach the daemon's
 * CAS, anchored on the backing Subaccord. Publish failure ≠ creation
 * failure — `failed` keeps the card in missing state with retry.
 */
export type PublishState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "published" }
  | { status: "failed"; error: string };

export type PublishEvent =
  | { type: "tx-confirmed" }
  | { type: "published" }
  | { type: "failed"; error: string }
  | { type: "retry" };

/** Advance the publish state machine; invalid transitions are no-ops. */
export function nextPublish(
  state: PublishState,
  event: PublishEvent,
): PublishState {
  switch (event.type) {
    case "tx-confirmed":
      return state.status === "idle" ? { status: "pending" } : state;
    case "published":
      return state.status === "pending" ? { status: "published" } : state;
    case "failed":
      return state.status === "pending"
        ? { status: "failed", error: event.error }
        : state;
    case "retry":
      return state.status === "failed" ? { status: "pending" } : state;
  }
}
