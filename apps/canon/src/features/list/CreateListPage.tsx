/**
 * Create list form (accord-fx93, happy path a).
 *
 * Controlled form at `/lists/new`. Builds a `CreateListArgs` + `CreateListAccounts`
 * from plain string inputs (decision #8: no zod, no react-hook-form), calls
 * `createList` from the canon SDK, signs + sends via `sendInstruction`, and
 * redirects to `/lists/:address` on success.
 *
 * The creator IS the connected wallet — the SDK adapter wires `creator: signer`.
 * The backing Subaccord is created via CPI inside the on-chain `create_list`
 * handler (Canon canonical defaults; the user does not configure Accord params).
 *
 * Signer seam: `useSigner()` resolves the connected wallet via ConnectorKit.
 * When no wallet is connected the form renders a connect-wallet gate.
 *
 * see SPEC §Instructions #1, milestone §1(a).
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Address } from "@solana/kit";
import { createList } from "@useaccord/canon";

import { useClusterRpc } from "@/shared/rpc";
import { sendInstruction } from "@/shared/transaction";
import { describeError } from "@/shared/errors";
import { useSigner } from "@/shared/wallet";

// --- Canon canonical defaults (mirror programs/canon/constants.rs) ---

const DEFAULT_SUBMIT_DEPOSIT = "500";
const DEFAULT_CHALLENGE_PCT_BPS = "5000";
const FIVE_DAYS_SECS = (5 * 24 * 60 * 60).toString();
const MAX_CHALLENGE_PCT_BPS = 10_000;

/** String-valued form state — every input is text; parsed on submit. */
interface FormState {
  stakeMint: string;
  feeMint: string;
  rulesHash: string;
  listProgram: string;
  submitDeposit: string;
  challengePct: string;
  listingWindow: string;
  withdrawalTimelock: string;
}

const DEFAULTS: FormState = {
  stakeMint: "",
  feeMint: "",
  rulesHash: "",
  listProgram: "",
  submitDeposit: DEFAULT_SUBMIT_DEPOSIT,
  challengePct: DEFAULT_CHALLENGE_PCT_BPS,
  listingWindow: FIVE_DAYS_SECS,
  withdrawalTimelock: FIVE_DAYS_SECS,
};

export function CreateListPage() {
  const { signer } = useSigner();
  const crpc = useClusterRpc();
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
    if (!signer) return;
    if (!crpc) {
      setError("No RPC cluster active.");
      return;
    }
    setSending(true);
    try {
      const listProgram = form.listProgram.trim() || SYSTEM_PROGRAM_ID;
      const { instruction, list } = await createList(
        {
          creator: signer,
          stakeMint: requireAddress(form.stakeMint, "Stake mint"),
          feeMint: requireAddress(form.feeMint, "Fee mint"),
        },
        {
          listProgram: listProgram as Address,
          rulesHash: parseHex32(form.rulesHash, "Rules hash"),
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
        },
      );
      await sendInstruction(
        crpc.rpc,
        crpc.rpcSubscriptions,
        signer,
        instruction,
      );
      navigate(`/lists/${list}`);
    } catch (e) {
      setError(describeError(e));
      setSending(false);
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="title">Create a list.</h1>
        <p className="lede">
          Curated registry with an Accord court backing every dispute.
        </p>
        <Link to="/" className="back">
          ← Back to lists.
        </Link>
      </header>

      {!signer ? (
        <div className="empty">
          <p className="empty-head">Connect a wallet.</p>
          <p className="empty-body">
            Creating a list signs with your wallet as the creator.
          </p>
        </div>
      ) : (
        <form className="form" onSubmit={onSubmit}>
          <fieldset>
            <legend className="section-head">Mints.</legend>
            <Field
              label="Stake mint"
              help="SPL mint — juror collateral in the backing Subaccord."
              placeholder="Mint address"
              value={form.stakeMint}
              onChange={(v) => set("stakeMint", v.trim())}
              required
              mono
            />
            <Field
              label="Fee mint"
              help="SPL mint — deposits + challenger stakes. May equal stake mint."
              placeholder="Mint address"
              value={form.feeMint}
              onChange={(v) => set("feeMint", v.trim())}
              required
              mono
            />
          </fieldset>

          <fieldset>
            <legend className="section-head">Identity.</legend>
            <Field
              label="Rules hash"
              help="32-byte hex (64 chars). Public listing criteria. Cannot be zero."
              placeholder="a1b2… (64 hex chars)"
              value={form.rulesHash}
              onChange={(v) => set("rulesHash", v.trim())}
              required
              mono
            />
            <Field
              label="List program"
              help="Program whose accounts this list curates. Empty = ownership check disabled."
              placeholder="leave empty for arbitrary"
              value={form.listProgram}
              onChange={(v) => set("listProgram", v.trim())}
              mono
            />
          </fieldset>

          <fieldset>
            <legend className="section-head">Economics.</legend>
            <Field
              label="Submit deposit"
              help={`Atomic units in fee mint. Base skin-in-the-game. Default ${DEFAULT_SUBMIT_DEPOSIT}.`}
              value={form.submitDeposit}
              onChange={(v) => set("submitDeposit", v)}
              required
              mono
            />
            <Field
              label="Challenge pct (bps)"
              help={`Challenger stake as fraction of accumulated. 0–${MAX_CHALLENGE_PCT_BPS}. Default ${DEFAULT_CHALLENGE_PCT_BPS} (50%).`}
              value={form.challengePct}
              onChange={(v) => set("challengePct", v)}
              required
              mono
            />
          </fieldset>

          <fieldset>
            <legend className="section-head">Windows (seconds).</legend>
            <Field
              label="Listing window"
              help="Watcher time to catch a scam before auto-list. Default 5 days (432000)."
              value={form.listingWindow}
              onChange={(v) => set("listingWindow", v)}
              required
              mono
            />
            <Field
              label="Withdrawal timelock"
              help="Fraud-challenge window during pending withdrawal. Default 5 days."
              value={form.withdrawalTimelock}
              onChange={(v) => set("withdrawalTimelock", v)}
              required
              mono
            />
          </fieldset>

          {error && (
            <p className="form-error mono" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="cta" disabled={sending}>
            {sending ? "Signing…" : "Create list."}
          </button>
        </form>
      )}
    </main>
  );
}

// --- constants --------------------------------------------------------------

/** `Pubkey::default()` — System Program; the sentinel that disables the
 * ownership check (curate arbitrary base58 data). */
const SYSTEM_PROGRAM_ID =
  "11111111111111111111111111111111" as const;

// --- parse + validate -------------------------------------------------------

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
