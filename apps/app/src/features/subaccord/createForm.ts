/**
 * createForm.ts — pure logic for the create-subaccord form (SubaccordCreatePage).
 *
 * Extracted from the page so it is node-testable: string-valued form state,
 * defaults (authority pre-filled with the signer, random domain ref, 4,096-seat
 * pool), the env-constant evidence operator, and `CreateSubaccordArgs` building
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
  type CreateSubaccordArgs,
} from "@useaccord/sdk";

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

/** String-valued form state — every input is text; parsed on submit. */
export interface FormState {
  domainRef: string; // 64 hex chars
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

/** 32 random bytes as 64 lowercase hex chars (`crypto.getRandomValues`). */
export function randomHex32(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Fresh form state: authority pre-filled with the signer, domain ref random. */
export function defaultFormState(signerAddress: Address): FormState {
  return {
    domainRef: randomHex32(),
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
    domainRef: parseHex32(form.domainRef, "Domain Ref"),
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
      form.aggregation === "median" ? Aggregation.Median : Aggregation.Plurality,
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
