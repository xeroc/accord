/**
 * createForm.ts — pure logic for the create-subaccord form (SubaccordCreatePage).
 *
 * Extracted from the page so it is node-testable: string-valued form state,
 * defaults (authority pre-filled with the signer, template-prefilled domain
 * doc, 4,096-seat pool), the env-constant evidence operator, doc→hash→args
 * (ADR-0027 amendment: `domain_ref = sha256(doc)`, hashed client-side — no
 * random generator; a random ref can never have a doc), and the post-confirm
 * publish state machine (pending/published/failed→retry). Form convention
 * (decision #8: no zod, no react-hook-form — parse on submit, throw on bad
 * input; the page surfaces the message).
 */
import { Address } from "@solana/kit";
import {
  Aggregation,
  ShortfallPolicy,
  DEFAULT_MIN_STAKE,
  DEFAULT_ALPHA_BPS,
  DEFAULT_REVIEW_WINDOW_SECS,
  DEFAULT_COMMIT_WINDOW_SECS,
  DEFAULT_REVEAL_WINDOW_SECS,
  DEFAULT_APPEAL_WINDOW_SECS,
  DEFAULT_MAX_APPEALS,
  DEFAULT_FEE_PER_JUROR,
  DEFAULT_REVEAL_THRESHOLD_BPS,
  DEFAULT_MAX_DRAW_ATTEMPTS,
  DEFAULT_COHERENCE_TOL_BPS,
  MAX_APPEALS,
  MAX_DRAW_ATTEMPTS,
  hashDomainDoc,
  type CreateSubaccordArgs,
} from "@useaccord/sdk";
import { DOMAIN_DOC_TEMPLATE } from "@useaccord/ui";

/** `Pubkey::default()` — on-chain sentinel for "no authority" / "no operator".
 * Local copy so this module stays importable from node tests (shared/wallet
 * pulls in ConnectorKit). Keep in sync with shared/wallet.ts. */
export const ZERO_ADDRESS = "11111111111111111111111111111111" as Address;

/**
 * Evidence operator — deployment CONSTANT (ADR-0006/0011), not a form input.
 * `VITE_EVIDENCE_OPERATOR` in the app .env; unset/empty → no operator.
 */
export const EVIDENCE_OPERATOR: Address = (import.meta.env
  ?.VITE_EVIDENCE_OPERATOR || ZERO_ADDRESS) as Address;

/** Pool capacity default: 4,096 juror seats (2^12). */
export const DEFAULT_POOL_DEPTH = 12;

/** How the form sources the domain identity (ADR-0027 amendment). */
export type DomainMode = "author" | "reference";

/** String-valued form state — every input is text; parsed on submit. */
export interface FormState {
  /** author: write the doc in-form (template prefill) → hash client-side.
   * reference: paste an existing doc's 64-hex hash (`domainRef`). */
  domainMode: DomainMode;
  /** Raw domain-doc text (author mode) — frontmatter + markdown rules. */
  domainDoc: string;
  domainRef: string; // reference mode: pasted 64-hex hash
  evidenceSpec: string; // 64 hex chars, empty → [0;32]
  stakingToken: string;
  feeToken: string;
  minStake: string;
  alphaBps: string;
  reviewWindow: string;
  commitWindow: string;
  revealWindow: string;
  appealWindow: string;
  maxAppeals: string;
  feePerJuror: string;
  revealThresholdBps: string;
  maxDrawAttempts: string;
  aggregation: string; // "plurality" | "median"
  coherenceTolBps: string;
  depth: string;
  authority: string;
  immutable: boolean; // authority = ZERO_ADDRESS when true
}

/** Doc bytes hashed/published for the form (author mode): UTF-8 of the text. */
export function docBytes(form: FormState): Uint8Array {
  return new TextEncoder().encode(form.domainDoc);
}

/** The domain-ref hex the form will put on chain: `sha256(doc)` in author
 * mode (live — recomputed as the doc is edited), the pasted hash in
 * reference mode (validated at `buildArgs`). */
export function domainRefHex(form: FormState): string {
  if (form.domainMode === "reference") return form.domainRef.trim();
  return hashDomainDoc(docBytes(form));
}

/** Fresh form state: authority pre-filled with the signer, author mode with
 * the template-prefilled domain doc. Deterministic — no random generator. */
export function defaultFormState(signerAddress: Address): FormState {
  return {
    domainMode: "author",
    domainDoc: DOMAIN_DOC_TEMPLATE,
    domainRef: "",
    evidenceSpec: "",
    stakingToken: "",
    feeToken: "",
    minStake: DEFAULT_MIN_STAKE.toString(),
    alphaBps: DEFAULT_ALPHA_BPS.toString(),
    reviewWindow: DEFAULT_REVIEW_WINDOW_SECS.toString(),
    commitWindow: DEFAULT_COMMIT_WINDOW_SECS.toString(),
    revealWindow: DEFAULT_REVEAL_WINDOW_SECS.toString(),
    appealWindow: DEFAULT_APPEAL_WINDOW_SECS.toString(),
    maxAppeals: DEFAULT_MAX_APPEALS.toString(),
    feePerJuror: DEFAULT_FEE_PER_JUROR.toString(),
    revealThresholdBps: DEFAULT_REVEAL_THRESHOLD_BPS.toString(),
    maxDrawAttempts: DEFAULT_MAX_DRAW_ATTEMPTS.toString(),
    aggregation: "plurality",
    coherenceTolBps: DEFAULT_COHERENCE_TOL_BPS.toString(),
    depth: DEFAULT_POOL_DEPTH.toString(),
    authority: signerAddress,
    immutable: false,
  };
}

/** Build the typed `CreateSubaccordArgs` from string inputs. Throws on bad
 * input — the submit handler surfaces the message. */
export function buildArgs(
  form: FormState,
  signerAddress: Address,
): CreateSubaccordArgs {
  return {
    domainRef: parseHex32(domainRefHex(form), "Domain Ref"),
    evidenceSpec: form.evidenceSpec
      ? parseHex32(form.evidenceSpec, "Evidence spec")
      : new Uint8Array(32),
    stakingToken: requireAddress(form.stakingToken, "Staking token"),
    feeToken: requireAddress(form.feeToken, "Fee token"),
    minStake: parseBigint(form.minStake, "Min stake"),
    alphaBps: parseBoundedInt(form.alphaBps, "Alpha", 0, 10_000),
    reviewWindow: parseBigint(form.reviewWindow, "Review window"),
    commitWindow: parseBigint(form.commitWindow, "Commit window"),
    revealWindow: parseBigint(form.revealWindow, "Reveal window"),
    appealWindow: parseBigint(form.appealWindow, "Appeal window"),
    maxAppeals: parseBoundedInt(form.maxAppeals, "Max appeals", 0, MAX_APPEALS),
    minJurySize: 3, // accord-9q3e: default round-1 panel (form field TODO)
    aggregation:
      form.aggregation === "median"
        ? Aggregation.Median
        : Aggregation.Plurality,
    coherenceTolBps: parseBoundedInt(
      form.coherenceTolBps,
      "Coherence tolerance",
      0,
      10_000,
    ),
    feePerJuror: parseBigint(form.feePerJuror, "Fee per juror"),
    revealThresholdBps: parseBoundedInt(
      form.revealThresholdBps,
      "Reveal threshold",
      0,
      10_000,
    ),
    shortfallPolicy: ShortfallPolicy.Redraw, // v1 sole variant (ADR-0021)
    maxDrawAttempts: parseBoundedInt(
      form.maxDrawAttempts,
      "Max draw attempts",
      1,
      MAX_DRAW_ATTEMPTS,
    ),
    authority: form.immutable
      ? ZERO_ADDRESS
      : (form.authority as Address) || signerAddress,
    evidenceOperator: EVIDENCE_OPERATOR,
    depth: parseBoundedInt(form.depth, "Tree depth", 1, 32),
  };
}

// --- parse + validate --------------------------------------------------------

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

function requireAddress(input: string, label: string): Address {
  const v = input.trim();
  if (!v) throw new Error(`${label}: address required.`);
  return v as Address;
}

// --- post-confirm publish state machine (ADR-0027 amendment) -----------------

/**
 * Publish lifecycle after the create-tx CONFIRMS (create-first): the
 * subaccord exists on-chain with `domain_ref = sha256(doc)`; the doc bytes
 * still have to reach the daemon's CAS. Publish failure ≠ creation failure —
 * `failed` keeps the card in missing state with retry.
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
