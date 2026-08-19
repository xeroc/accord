/**
 * Create subaccord form (accord-9yor, happy path a).
 *
 * Controlled form at `/subaccords/new`. Two-tier layout (simplify-accord-ux):
 * essentials (staking/fee token, min stake, fee per juror, aggregation,
 * authority — pre-filled with the wallet, with the immutable toggle inline;
 * checking it disables the field and shows `Pubkey::default()`) are always
 * visible; everything else (identity, windows, panel, slashing) hides behind an
 * 32-byte value and can be reshuffled in advanced. The evidence operator is
 * NOT a form input — it is the deployment constant `VITE_EVIDENCE_OPERATOR`
 * (createForm.ts).
 *
 * Builds a `CreateSubaccordArgs` from plain string inputs (decision #8: no
 * zod, no react-hook-form), derives the Subaccord PDA + instruction via
 * `accord.methods.createSubaccord`, signs + sends via `sendInstruction`, and
 * redirects to `/subaccords/:address`.
 *
 * The creator IS the connected wallet — the SDK adapter wires `creator:
 * accord.signer` (adapter.ts:144), so the PDA is `[subaccord, signer, domainRef]`.
 * The form remounts on wallet switch (`key={signer.address}`): defaults
 * re-derive (fresh random domain ref, authority re-prefilled).
 *
 * Signer seam: `useSigner()` resolves the connected wallet via ConnectorKit.
 * When no wallet is connected the form renders a connect-wallet gate; the
 * submit path activates the moment a wallet connects in the navbar.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronRightIcon, DicesIcon } from "lucide-react";
import type { TransactionSigner } from "@solana/kit";
import { Accord } from "@useaccord/sdk";
import {
  DEFAULT_ALPHA_BPS,
  DEFAULT_COHERENCE_TOL_BPS,
  DEFAULT_MAX_APPEALS,
  DEFAULT_MAX_DRAW_ATTEMPTS,
  MAX_APPEALS,
  MAX_DRAW_ATTEMPTS,
  MAX_SAFE_TREE_DEPTH,
  MIN_APPEAL_WINDOW_SECS,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { useSigner } from "../../shared/wallet";
import { ErrorShake } from "@useaccord/ui";
import {
  buildArgs,
  defaultFormState,
  randomHex32,
  ZERO_ADDRESS,
  type FormState,
} from "./createForm";

export function SubaccordCreatePage() {
  const { signer } = useSigner();

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.01em]">Create a subaccord.</h1>
        <p className="mb-4 text-muted-foreground">
          Stake pool adjudicating one class of dispute. Immutable identity.
        </p>
        <Link to="/subaccords" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Back to subaccords.
        </Link>
      </header>

      {!signer ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Connect a wallet.</p>
          <p className="mb-5 text-muted-foreground">
            Creating a subaccord signs with your wallet as the creator.
          </p>
        </div>
      ) : (
        /* key: (re)mount on connect/switch → fresh defaults (random domain
           ref, authority re-prefilled with the active wallet) */
        <CreateForm key={signer.address} signer={signer} />
      )}
    </main>
  );
}

export function CreateForm({ signer }: { signer: TransactionSigner }) {
  const crpc = useClusterRpc();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(() =>
    defaultFormState(signer.address),
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!crpc) {
      setError("No RPC cluster active.");
      return;
    }
    setSending(true);
    try {
      const args = buildArgs(form, signer.address);
      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const { instruction, subaccord } = await accord.methods.createSubaccord(
        signer.address,
        args,
      );
      await sendInstruction(
        crpc.rpc,
        crpc.rpcSubscriptions,
        signer,
        instruction,
      );
      navigate(`/subaccords/${subaccord}`);
    } catch (e) {
      setError(describeError(e));
      setSending(false);
    }
  }

  return (
    <ErrorShake active={!!error}>
      <form className="flex flex-col gap-7" onSubmit={onSubmit}>
          <fieldset className="gap-4 grid rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">Essentials.</legend>
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
              label="Fee per juror"
              help="Atomic units in fee token. Default 0."
              value={form.feePerJuror}
              onChange={(v) => set("feePerJuror", v)}
              required
              mono
            />
            <label className="flex flex-col gap-1">
              <span className="text-sm text-foreground">Aggregation.</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                value={form.aggregation}
                onChange={(e) => set("aggregation", e.target.value)}
              >
                <option value="plurality">Plurality — pick one of N options</option>
                <option value="median">Median — scalar ruling (ADR-0025)</option>
              </select>
              <span className="text-xs text-muted-foreground">
                How revealed votes aggregate into a ruling. Median disputes file
                without option hashes; the vote is a scalar.
              </span>
            </label>
            {form.aggregation === "median" && (
              <Field
                label="Coherence tolerance (bps)"
                help={`Max relative spread of scalar reveals before incoherence kicks in. 0–10,000. Default ${DEFAULT_COHERENCE_TOL_BPS}.`}
                value={form.coherenceTolBps}
                onChange={(v) => set("coherenceTolBps", v)}
                required
                mono
              />
            )}
            <Field
              label="Authority"
              help={
                form.immutable
                  ? "Pubkey::default() — immutable: no authority can update terms."
                  : "Address that signs propose/execute updates. Pre-filled with your wallet."
              }
              value={form.immutable ? ZERO_ADDRESS : form.authority}
              onChange={(v) => set("authority", v.trim())}
              mono
              disabled={form.immutable}
              action={
                <label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.immutable}
                    onChange={(e) => set("immutable", e.target.checked)}
                  />{" "}
                  Immutable
                </label>
              }
            />
          </fieldset>

          <CollapsiblePrimitive.Root open={advanced} onOpenChange={setAdvanced}>
            <CollapsiblePrimitive.Trigger className="group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRightIcon
                className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-90"
                aria-hidden
              />
              Advanced settings
              <span className="text-xs font-normal text-muted-foreground/70">
                identity · windows · panel · slashing
              </span>
            </CollapsiblePrimitive.Trigger>
            <CollapsiblePrimitive.Content className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:grid-rows-[1fr]">
              <div className="overflow-hidden">
                <div className="flex flex-col gap-7 pt-5">
                  <fieldset className="gap-4 grid rounded-lg border border-border p-5">
                    <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">Identity.</legend>
                    <Field
                      label="Domain Ref"
                      help="32-byte hex (64 chars). The immutable dispute class. Randomized — reshuffle or paste your own."
                      value={form.domainRef}
                      onChange={(v) => set("domainRef", v.trim())}
                      required
                      mono
                      action={
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-amber transition-opacity hover:opacity-80 active:scale-[0.96]"
                          onClick={() => set("domainRef", randomHex32())}
                        >
                          <DicesIcon className="size-3.5" aria-hidden />
                          Reshuffle
                        </button>
                      }
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

                  <fieldset className="gap-4 grid rounded-lg border border-border p-5">
                    <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">Windows (seconds).</legend>
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
                    <Field
                      label="Alpha (bps)"
                      help={`Slash factor. 0–10,000. Default ${DEFAULT_ALPHA_BPS} (10%).`}
                      value={form.alphaBps}
                      onChange={(v) => set("alphaBps", v)}
                      required
                      mono
                    />
                  </fieldset>

                  <fieldset className="gap-4 grid rounded-lg border border-border p-5">
                    <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">Panel.</legend>
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
                    <DepthPicker value={form.depth} onChange={(v) => set("depth", v)} />
                  </fieldset>

                </div>
              </div>
            </CollapsiblePrimitive.Content>
          </CollapsiblePrimitive.Root>

          {error && (
            <p className="font-mono text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]" disabled={sending}>
            {sending ? "Signing…" : "Create subaccord."}
          </button>
      </form>
    </ErrorShake>
  );
}

// --- depth picker (pool capacity) -------------------------------------------

/** Curated depth options — capped at MAX_SAFE_TREE_DEPTH (browser tx limit). */
const DEPTH_OPTIONS = [
  { depth: 4, note: "16 seats — testing" },
  { depth: 6, note: "64 seats — small pool" },
  { depth: 8, note: "256 seats" },
  { depth: 10, note: "1,024 seats" },
  { depth: 12, note: "4,096 seats — recommended" },
  { depth: 14, note: "16,384 seats — large" },
  { depth: MAX_SAFE_TREE_DEPTH, note: "65,536 seats — max" },
] as const;

function DepthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground">Pool capacity.</span>
      <select
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {DEPTH_OPTIONS.map((opt) => (
          <option key={opt.depth} value={opt.depth}>
            {opt.note}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">
        Maximum juror seats. Each stake/unstake tx carries a Merkle proof
        proportional to depth — depths beyond {MAX_SAFE_TREE_DEPTH} exceed the
        1232-byte transaction limit in browser wallets.
      </span>
    </label>
  );
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
  action,
  disabled,
}: {
  label: string;
  help?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  mono?: boolean;
  action?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-sm text-foreground">
        {label}.{required ? " *" : ""}
        {action}
      </span>
      <input
        className={`rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${mono ? "font-mono text-sm text-foreground" : ""}`}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
      />
      {help && <span className="text-xs text-muted-foreground">{help}</span>}
    </label>
  );
}
