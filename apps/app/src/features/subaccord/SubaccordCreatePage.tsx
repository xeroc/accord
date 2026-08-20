/**
 * Create subaccord form (accord-9yor, happy path a; domain-doc authoring
 * per the ADR-0027 amendment — accord-afcn).
 *
 * Controlled form at `/subaccords/new`. Two-tier layout (simplify-accord-ux):
 * the domain document (default: editable DomainDocCard, template-prefilled —
 * the doc IS the identity, `domain_ref = sha256(doc)` hashed client-side;
 * advanced: paste an existing doc's hash with live GET+verify preview) sits
 * above the essentials (staking/fee token, min stake, fee per juror,
 * aggregation, authority — pre-filled with the wallet, with the immutable
 * toggle inline). Everything else (evidence spec, windows, panel, slashing)
 * hides behind "Advanced settings". The evidence operator is NOT a form
 * input — it is the deployment constant `VITE_EVIDENCE_OPERATOR`
 * (createForm.ts).
 *
 * CREATE-FIRST publish (ADR-0027 amendment): build args from plain string
 * inputs (decision #8: no zod, no react-hook-form), derive the Subaccord PDA
 * + instruction via `accord.methods.createSubaccord`, sign + send via
 * `sendInstruction` (waits for confirmation), THEN publish the doc bytes to
 * the daemon CAS via `putDomainDoc(…, { subaccord })` — the daemon
 * anchor-verifies `domain_ref == hash`. Publish failure ≠ creation failure:
 * toast + the card flips to missing state with retry (re-publish the doc, or
 * upload the original file — client-checked `sha256(bytes) == domain_ref`).
 * Success redirects to `/subaccords/:address`.
 *
 * The creator IS the connected wallet — the SDK adapter wires `creator:
 * accord.signer` (adapter.ts:144), so the PDA is `[subaccord, signer, domainRef]`.
 * The form remounts on wallet switch (`key={signer.address}`): defaults
 * re-derive (template doc, authority re-prefilled).
 *
 * Signer seam: `useSigner()` resolves the connected wallet via ConnectorKit.
 * When no wallet is connected the form renders a connect-wallet gate; the
 * submit path activates the moment a wallet connects in the navbar.
 */
import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import type { TransactionSigner } from "@solana/kit";
import { Accord, putDomainDoc, verifyDomainDoc } from "@useaccord/sdk";
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
import {
  Button,
  DomainDocCard,
  ErrorShake,
  Field as UiField,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Label,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@useaccord/ui";

import { useClusterRpc } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { useSigner } from "../../shared/wallet";
import { useDomainDoc } from "../domain/DomainDocPanel";
import { EVIDENCE_DAEMON_URL } from "../dispute/evidence/config";
import {
  buildArgs,
  defaultFormState,
  docBytes,
  domainRefHex,
  nextPublish,
  ZERO_ADDRESS,
  type FormState,
  type PublishState,
} from "./createForm";

export function SubaccordCreatePage() {
  const { signer } = useSigner();

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Create a subaccord.</h1>
        <p className="mb-4 text-muted-foreground">
          Stake pool adjudicating one class of dispute. Immutable identity.
        </p>
        <Link
          to="/subaccords"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to subaccords.
        </Link>
      </header>

      {!signer ? (
        <EmptyState
          title="Connect a wallet."
          description="Creating a subaccord signs with your wallet as the creator."
        />
      ) : (
        /* key: (re)mount on connect/switch → fresh defaults (template doc,
           authority re-prefilled with the active wallet) */
        <CreateForm key={signer.address} signer={signer} />
      )}
    </>
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
  // post-confirm publish (author mode): anchor subaccord + frozen on-chain ref
  const [publish, setPublish] = useState<PublishState>({ status: "idle" });
  const [subaccordAddr, setSubaccordAddr] = useState<string | null>(null);
  const [onChainRef, setOnChainRef] = useState<string | null>(null);

  const refHex = domainRefHex(form);
  const signingOrPublishing = sending || publish.status === "pending";
  // live GET+verify preview for a pasted hash (reference mode, 64-hex only)
  const previewHash =
    form.domainMode === "reference" && /^[0-9a-fA-F]{64}$/.test(refHex)
      ? refHex.toLowerCase()
      : undefined;
  const preview = useDomainDoc(previewHash);

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
      // tx CONFIRMED — create-first: publish the doc behind the on-chain ref
      if (form.domainMode === "author") {
        setSubaccordAddr(subaccord);
        setOnChainRef(refHex);
        setPublish((s) => nextPublish(s, { type: "tx-confirmed" }));
        try {
          await putDomainDoc(EVIDENCE_DAEMON_URL, docBytes(form), {
            subaccord,
          });
          setPublish((s) => nextPublish(s, { type: "published" }));
          toast.success("Subaccord created. Domain document published.");
        } catch (err) {
          const msg = describeError(err);
          setPublish((s) => nextPublish(s, { type: "failed", error: msg }));
          toast.error(
            `Subaccord created, but the domain document was not published — ${msg}`,
          );
          setSending(false);
          return; // stay: card flips to missing state with retry
        }
      } else {
        toast.success("Subaccord created.");
      }
      navigate(`/subaccords/${subaccord}`);
    } catch (e) {
      setError(describeError(e));
      setSending(false);
    }
  }

  /** Retry the daemon publish after a failure (bytes re-checked client-side:
   * sha256(doc) must equal the frozen on-chain ref). */
  async function onRetryPublish() {
    if (!subaccordAddr || !onChainRef) return;
    if (!verifyDomainDoc(docBytes(form), onChainRef)) {
      toast.error(
        "The document no longer hashes to the on-chain domain ref — upload the original file.",
      );
      return;
    }
    setPublish((s) => nextPublish(s, { type: "retry" }));
    try {
      await putDomainDoc(EVIDENCE_DAEMON_URL, docBytes(form), {
        subaccord: subaccordAddr,
      });
      setPublish((s) => nextPublish(s, { type: "published" }));
      toast.success("Domain document published.");
      navigate(`/subaccords/${subaccordAddr}`);
    } catch (err) {
      const msg = describeError(err);
      setPublish((s) => nextPublish(s, { type: "failed", error: msg }));
      toast.error(`Publish failed — ${msg}`);
    }
  }

  /** Retry via file upload: client-check sha256(bytes) == on-chain ref
   * before accepting the bytes back into the editor. */
  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ref = onChainRef ?? refHex;
    if (!verifyDomainDoc(bytes, ref)) {
      toast.error(
        "File does not hash to the on-chain domain ref — not the original document.",
      );
      return;
    }
    set("domainDoc", new TextDecoder().decode(bytes));
    toast.success("Original document loaded.");
  }

  return (
    <ErrorShake active={!!error}>
      <form className="flex flex-col gap-7" onSubmit={onSubmit}>
        <fieldset className="gap-4 grid rounded-lg border border-border p-5">
          <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
            Domain document.
          </legend>
          {publish.status === "failed" ? (
            <DomainDocCard
              doc={{ status: "missing" }}
              hash={onChainRef ?? refHex}
              retry={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onRetryPublish()}
                  >
                    Retry publish
                  </Button>
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent">
                    Upload original file
                    <input
                      type="file"
                      accept=".md,.markdown,.txt,text/markdown,text/plain"
                      className="hidden"
                      onChange={(e) => void onUploadFile(e)}
                    />
                  </label>
                </div>
              }
            />
          ) : form.domainMode === "author" ? (
            <>
              <DomainDocCard
                editable={!signingOrPublishing}
                value={form.domainDoc}
                onValueChange={(v) => set("domainDoc", v)}
                hash={refHex}
              />
              <button
                type="button"
                className="w-fit text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                onClick={() => set("domainMode", "reference")}
              >
                Reference an existing doc by hash instead →
              </button>
            </>
          ) : (
            <>
              <Field
                label="Existing doc hash"
                help="64-hex sha256 of an already-authored domain document. Preview below verifies the bytes behind the hash."
                placeholder="64 hex chars"
                value={form.domainRef}
                onChange={(v) => set("domainRef", v.trim())}
                required
                mono
              />
              {previewHash ? (
                <DomainDocCard doc={preview.doc} hash={previewHash} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Paste a 64-hex hash to preview + verify the referenced
                  document.
                </p>
              )}
              <button
                type="button"
                className="w-fit text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                onClick={() => set("domainMode", "author")}
              >
                ← Author a new document
              </button>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            The document is the subaccord's identity — its sha256 becomes the
            immutable on-chain domain ref. After creation confirms, the document
            is published to the domain registry (ADR-0027).
          </p>
        </fieldset>

        <fieldset className="gap-4 grid rounded-lg border border-border p-5">
          <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
            Essentials.
          </legend>
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
          <UiField>
            <FieldLabel>Aggregation.</FieldLabel>
            <FieldControl>
              <Select
                value={form.aggregation}
                onValueChange={(v) => set("aggregation", v)}
              >
                <SelectTrigger className="w-full" aria-label="Aggregation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plurality">
                    Plurality — pick one of N options
                  </SelectItem>
                  <SelectItem value="median">
                    Median — scalar ruling (ADR-0025)
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldControl>
            <FieldDescription>
              How revealed votes aggregate into a ruling. Median disputes file
              without option hashes; the vote is a scalar.
            </FieldDescription>
          </UiField>
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
              <Label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.immutable}
                  onChange={(e) => set("immutable", e.target.checked)}
                />{" "}
                Immutable
              </Label>
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
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
                    Identity.
                  </legend>
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
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
                    Windows (seconds).
                  </legend>
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
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
                    Panel.
                  </legend>
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
                  <DepthPicker
                    value={form.depth}
                    onChange={(v) => set("depth", v)}
                  />
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

        <Button type="submit" loading={signingOrPublishing}>
          {publish.status === "pending"
            ? "Publishing domain document…"
            : sending
              ? "Signing…"
              : "Create subaccord."}
        </Button>
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
    <UiField>
      <FieldLabel>Pool capacity.</FieldLabel>
      <FieldControl>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full" aria-label="Pool capacity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEPTH_OPTIONS.map((opt) => (
              <SelectItem key={opt.depth} value={opt.depth.toString()}>
                {opt.note}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldControl>
      <FieldDescription>
        Maximum juror seats. Each stake/unstake tx carries a Merkle proof
        proportional to depth — depths beyond {MAX_SAFE_TREE_DEPTH} exceed the
        1232-byte transaction limit in browser wallets.
      </FieldDescription>
    </UiField>
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
    <UiField>
      <FieldLabel>
        {label}.{required ? " *" : ""}
        {action}
      </FieldLabel>
      <FieldControl>
        <Input
          className={mono ? "font-mono" : undefined}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
        />
      </FieldControl>
      {help && <FieldDescription>{help}</FieldDescription>}
    </UiField>
  );
}
