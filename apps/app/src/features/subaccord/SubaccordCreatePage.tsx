/**
 * Create subaccord form (accord-9yor, happy path a).
 *
 * Controlled form at `/subaccords/new`. Builds a `CreateSubaccordArgs` from
 * plain string inputs (decision #8: no zod, no react-hook-form), derives the
 * Subaccord PDA + instruction via `accord.methods.createSubaccord`, signs +
 * sends via `sendInstruction`, and redirects to `/subaccords/:address`.
 *
 * The creator IS the connected wallet — the SDK adapter wires `creator:
 * accord.signer` (adapter.ts:144), so the PDA is `[subaccord, signer, riskType]`.
 * `authority` defaults to the signer (governable) or the zero key (immutable).
 *
 * Signer seam: `useSigner()` returns null until ConnectorKit lands (accord-y5av).
 * Until then the form renders a connect-wallet gate; the submit path is wired
 * and activates the moment a real signer is provided.
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Address } from "@solana/kit";
import {
  Accord,
  Aggregation,
  ShortfallPolicy,
  DEFAULT_MIN_STAKE,
  DEFAULT_ALPHA_BPS,
  DEFAULT_REVIEW_WINDOW_SECS,
  DEFAULT_COMMIT_WINDOW_SECS,
  DEFAULT_REVEAL_WINDOW_SECS,
  DEFAULT_APPEAL_WINDOW_SECS,
  DEFAULT_MAX_APPEALS,
  DEFAULT_REVEAL_THRESHOLD_BPS,
  DEFAULT_MAX_DRAW_ATTEMPTS,
  DEFAULT_FEE_PER_JUROR,
  DEFAULT_TREE_DEPTH,
  MAX_APPEALS,
  MAX_DRAW_ATTEMPTS,
  MIN_APPEAL_WINDOW_SECS,
  type CreateSubaccordArgs,
} from "@useaccord/sdk";

import { getEndpoint, getRpc, getRpcSubscriptions } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { ZERO_ADDRESS, useSigner } from "../../shared/wallet";

/** String-valued form state — every input is text; parsed on submit. */
interface FormState {
  riskType: string; // 64 hex chars
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
  depth: string;
  authority: string;
  evidenceOperator: string;
  immutable: boolean; // authority = ZERO_ADDRESS when true
}

const DEFAULTS: FormState = {
  riskType: "",
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
  depth: DEFAULT_TREE_DEPTH.toString(),
  authority: "",
  evidenceOperator: "",
  immutable: false,
};

export function SubaccordCreatePage() {
  const { signer } = useSigner();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signer) return; // gate: connect-wallet banner shows below.
    setSending(true);
    try {
      const args = buildArgs(form, signer.address);
      const accord = new Accord({ endpoint: getEndpoint("devnet"), signer });
      const { instruction, subaccord } = await accord.methods.createSubaccord(
        signer.address,
        args,
      );
      await sendInstruction(
        getRpc("devnet"),
        getRpcSubscriptions("devnet"),
        signer,
        instruction,
      );
      navigate(`/subaccords/${subaccord}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="title">Create a subaccord.</h1>
        <p className="lede">
          Stake pool adjudicating one class of dispute. Immutable identity.
        </p>
        <Link to="/subaccords" className="back">
          ← Back to subaccords.
        </Link>
      </header>

      {!signer ? (
        <div className="empty">
          <p className="empty-head">Connect a wallet.</p>
          <p className="empty-body">
            Creating a subaccord signs with your wallet as the creator.
          </p>
        </div>
      ) : (
        <form className="form" onSubmit={onSubmit}>
          <fieldset>
            <legend className="section-head">Identity.</legend>
            <Field
              label="Risk type"
              help="32-byte hex (64 chars). The immutable dispute class. Cannot be zero."
              placeholder="a1b2… (64 hex chars)"
              value={form.riskType}
              onChange={(v) => set("riskType", v.trim())}
              required
              mono
            />
            <Field
              label="Evidence spec"
              help="32-byte hex (64 chars). Empty = [0;32]."
              placeholder="leave empty for default"
              value={form.evidenceSpec}
              onChange={(v) => set("evidenceSpec", v.trim())}
              mono
            />
          </fieldset>

          <fieldset>
            <legend className="section-head">Economics.</legend>
            <Field
              label="Staking token"
              help="SPL mint — juror collateral (ADR-0020)."
              placeholder="Mint address"
              value={form.stakingToken}
              onChange={(v) => set("stakingToken", v.trim())}
              required
              mono
            />
            <Field
              label="Fee token"
              help="SPL mint — compensation + bonds (ADR-0020)."
              placeholder="Mint address"
              value={form.feeToken}
              onChange={(v) => set("feeToken", v.trim())}
              required
              mono
            />
            <Field
              label="Min stake"
              help="Atomic units. Default 1,000."
              value={form.minStake}
              onChange={(v) => set("minStake", v)}
              required
              mono
            />
            <Field
              label="Alpha (bps)"
              help={`Slash factor. 0–10,000. Default ${DEFAULT_ALPHA_BPS} (10%).`}
              value={form.alphaBps}
              onChange={(v) => set("alphaBps", v)}
              required
              mono
            />
            <Field
              label="Fee per juror"
              help="Atomic units in fee token. Default 0."
              value={form.feePerJuror}
              onChange={(v) => set("feePerJuror", v)}
              required
              mono
            />
          </fieldset>

          <fieldset>
            <legend className="section-head">Windows (seconds).</legend>
            <Field
              label="Review"
              help="Jurors assess evidence. Default 7 days."
              value={form.reviewWindow}
              onChange={(v) => set("reviewWindow", v)}
              required
              mono
            />
            <Field
              label="Commit"
              help="hash(vote, salt). Default 2 days."
              value={form.commitWindow}
              onChange={(v) => set("commitWindow", v)}
              required
              mono
            />
            <Field
              label="Reveal"
              help="{vote, salt}. Default 2 days."
              value={form.revealWindow}
              onChange={(v) => set("revealWindow", v)}
              required
              mono
            />
            <Field
              label="Appeal"
              help={`After round resolves. ≥ ${MIN_APPEAL_WINDOW_SECS}. Default 3 days.`}
              value={form.appealWindow}
              onChange={(v) => set("appealWindow", v)}
              required
              mono
            />
          </fieldset>

          <fieldset>
            <legend className="section-head">Panel.</legend>
            <Field
              label="Max appeals"
              help={`0–${MAX_APPEALS}. Panel ladder 3→7→15→31. Default ${DEFAULT_MAX_APPEALS}.`}
              value={form.maxAppeals}
              onChange={(v) => set("maxAppeals", v)}
              required
              mono
            />
            <Field
              label="Reveal threshold (bps)"
              help="Reveal-quorum fraction. Default 6,666 (2/3)."
              value={form.revealThresholdBps}
              onChange={(v) => set("revealThresholdBps", v)}
              required
              mono
            />
            <Field
              label="Max draw attempts"
              help={`Shortfall redraw cap. 1–${MAX_DRAW_ATTEMPTS}. Default ${DEFAULT_MAX_DRAW_ATTEMPTS}.`}
              value={form.maxDrawAttempts}
              onChange={(v) => set("maxDrawAttempts", v)}
              required
              mono
            />
            <Field
              label="Tree depth"
              help="Accumulator depth. 2^depth seats. Default 20."
              value={form.depth}
              onChange={(v) => set("depth", v)}
              required
              mono
            />
          </fieldset>

          <fieldset>
            <legend className="section-head">Authority.</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={form.immutable}
                onChange={(e) => set("immutable", e.target.checked)}
              />{" "}
              Immutable — no authority can update terms.
            </label>
            {!form.immutable && (
              <Field
                label="Authority"
                help="Address that signs propose/execute updates. Default = your wallet."
                placeholder={signer.address}
                value={form.authority}
                onChange={(v) => set("authority", v.trim())}
                mono
              />
            )}
            <Field
              label="Evidence operator"
              help="Trusted re-encryption service (ADR-0006). Empty = none."
              placeholder="leave empty for none"
              value={form.evidenceOperator}
              onChange={(v) => set("evidenceOperator", v.trim())}
              mono
            />
          </fieldset>

          {error && (
            <p className="form-error mono" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="cta" disabled={sending}>
            {sending ? "Signing…" : "Create subaccord."}
          </button>
        </form>
      )}
    </main>
  );
}

// --- parse + validate -------------------------------------------------------

/** Build the typed `CreateSubaccordArgs` from string inputs. Throws on bad
 * input — the submit handler surfaces the message. */
function buildArgs(
  form: FormState,
  signerAddress: Address,
): CreateSubaccordArgs {
  return {
    riskType: parseHex32(form.riskType, "Risk type"),
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
    aggregation: Aggregation.Plurality, // v1 sole variant (ADR-0019)
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
    evidenceOperator: (form.evidenceOperator as Address) || ZERO_ADDRESS,
    depth: parseBoundedInt(form.depth, "Tree depth", 1, 32),
  };
}

/** Parse a 64-char hex string into `Uint8Array(32)`. 0x prefix optional. */
function parseHex32(input: string, label: string): Uint8Array {
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

// --- field primitive --------------------------------------------------------

function Field({
  label,
  help,
  placeholder,
  value,
  onChange,
  required,
  mono,
}: {
  label: string;
  help?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="field">
      <span className="label">
        {label}.{required ? " *" : ""}
      </span>
      <input
        className={`input ${mono ? "mono" : ""}`}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {help && <span className="help">{help}</span>}
    </label>
  );
}
