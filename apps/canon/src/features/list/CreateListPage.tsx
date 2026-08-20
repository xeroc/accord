/**
 * Create list form (accord-fx93, happy path a; rules-doc authoring per the
 * ADR-0027 amendment — accord-nh14).
 *
 * Controlled form at `/lists/new`. Builds a `CreateListArgs` + `CreateListAccounts`
 * from plain string inputs (decision #8: no zod, no react-hook-form — logic in
 * the node-tested `createForm.ts`), calls `createList` from the canon SDK
 * (which CPIs the backing Subaccord with `domain_ref := rules_hash`), signs +
 * sends via `sendInstruction`.
 *
 * Rules identity (create-first, ADR-0027 amendment): default = author the
 * rules doc in an editable DomainDocCard (template prefill), hashed
 * client-side (`rules_hash = sha256(doc)`); advanced = paste an existing
 * doc's hash with a live GET+verify preview. After the create-tx CONFIRMS,
 * the doc is published via SDK `putDomainDoc(…, { subaccord })` against the
 * backing Subaccord (the daemon anchor-verifies `domain_ref == hash`).
 * Publish failure ≠ creation failure: toast + the card flips to missing
 * state with retry (re-publish the doc, or upload the original file —
 * client-checked `sha256(bytes) == rules_hash`). Success redirects to
 * `/lists/:address`.
 *
 * The creator IS the connected wallet — the SDK adapter wires `creator: signer`.
 * Canon canonical defaults fill the backing Subaccord; the user does not
 * configure Accord params except the evidence operator, which is
 * deployment-configured — see EVIDENCE_OPERATOR below.
 *
 * Signer seam: `useSigner()` resolves the connected wallet via ConnectorKit.
 * When no wallet is connected the form renders a connect-wallet gate.
 *
 * see SPEC §Instructions #1, milestone §1(a).
 */
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createList } from "@useaccord/canon";
import { putDomainDoc, verifyDomainDoc } from "@useaccord/sdk";
import { Button, DomainDocCard } from "@useaccord/ui";
import { toast } from "sonner";

import { useClusterRpc } from "@/shared/rpc";
import { sendInstruction } from "@/shared/transaction";
import { describeError } from "@/shared/errors";
import { useSigner } from "@/shared/wallet";
import { useDomainDoc } from "@/features/domain/DomainDocPanel";
import {
  DEFAULTS,
  DEFAULT_CHALLENGE_PCT_BPS,
  DEFAULT_SUBMIT_DEPOSIT,
  MAX_CHALLENGE_PCT_BPS,
  buildArgs,
  docBytes,
  nextPublish,
  requireAddress,
  rulesHashHex,
  type FormState,
  type PublishState,
} from "./createForm";

const EVIDENCE_DAEMON_URL =
  import.meta.env.VITE_EVIDENCE_DAEMON_URL ?? "http://localhost:8080";

/** Deployment-configured evidence operator — the evidence daemon's Ed25519
 * pubkey (must match a key in the daemon's keyring). Static per .env, not a
 * form field — same pattern as VITE_EVIDENCE_DAEMON_URL. The program rejects
 * the default pubkey: a zero operator key can never be an ECIES target. */
const EVIDENCE_OPERATOR = import.meta.env.VITE_EVIDENCE_OPERATOR_ADDRESS ?? "";

export function CreateListPage() {
  const { signer } = useSigner();
  const crpc = useClusterRpc();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // post-confirm publish (author mode): anchor subaccord + frozen rules hash
  const [publish, setPublish] = useState<PublishState>({ status: "idle" });
  const [listAddr, setListAddr] = useState<string | null>(null);
  const [subaccordAddr, setSubaccordAddr] = useState<string | null>(null);
  const [onChainRef, setOnChainRef] = useState<string | null>(null);

  const refHex = rulesHashHex(form);
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
    if (!signer) return;
    if (!crpc) {
      setError("No RPC cluster active.");
      return;
    }
    setSending(true);
    try {
      const args = buildArgs(form);
      const { instruction, list, subaccord } = await createList(
        {
          creator: signer,
          stakeMint: requireAddress(form.stakeMint, "Stake mint"),
          feeMint: requireAddress(form.feeMint, "Fee mint"),
        },
        {
          ...args,
          evidenceOperator: requireAddress(
            EVIDENCE_OPERATOR,
            "Evidence operator (set VITE_EVIDENCE_OPERATOR_ADDRESS in .env)",
          ),
        },
      );
      await sendInstruction(
        crpc.rpc,
        crpc.rpcSubscriptions,
        signer,
        instruction,
      );
      // tx CONFIRMED — create-first: publish the doc behind the rules hash,
      // anchored on the backing Subaccord (domain_ref := rules_hash)
      if (form.domainMode === "author") {
        setListAddr(list);
        setSubaccordAddr(subaccord);
        setOnChainRef(refHex);
        setPublish((s) => nextPublish(s, { type: "tx-confirmed" }));
        try {
          await putDomainDoc(EVIDENCE_DAEMON_URL, docBytes(form), {
            subaccord,
          });
          setPublish((s) => nextPublish(s, { type: "published" }));
          toast.success("List created. Rules document published.");
        } catch (err) {
          const msg = describeError(err);
          setPublish((s) => nextPublish(s, { type: "failed", error: msg }));
          toast.error(
            `List created, but the rules document was not published — ${msg}`,
          );
          setSending(false);
          return; // stay: card flips to missing state with retry
        }
      } else {
        toast.success("List created.");
      }
      navigate(`/lists/${list}`);
    } catch (e) {
      setError(describeError(e));
      setSending(false);
    }
  }

  /** Retry the daemon publish after a failure (bytes re-checked client-side:
   * sha256(doc) must equal the frozen on-chain rules hash). */
  async function onRetryPublish() {
    if (!listAddr || !subaccordAddr || !onChainRef) return;
    if (!verifyDomainDoc(docBytes(form), onChainRef)) {
      toast.error(
        "The document no longer hashes to the on-chain rules hash — upload the original file.",
      );
      return;
    }
    setPublish((s) => nextPublish(s, { type: "retry" }));
    try {
      await putDomainDoc(EVIDENCE_DAEMON_URL, docBytes(form), {
        subaccord: subaccordAddr,
      });
      setPublish((s) => nextPublish(s, { type: "published" }));
      toast.success("Rules document published.");
      navigate(`/lists/${listAddr}`);
    } catch (err) {
      const msg = describeError(err);
      setPublish((s) => nextPublish(s, { type: "failed", error: msg }));
      toast.error(`Publish failed — ${msg}`);
    }
  }

  /** Retry via file upload: client-check sha256(bytes) == on-chain rules
   * hash before accepting the bytes back into the editor. */
  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ref = onChainRef ?? refHex;
    if (!verifyDomainDoc(bytes, ref)) {
      toast.error(
        "File does not hash to the on-chain rules hash — not the original document.",
      );
      return;
    }
    set("rulesDoc", new TextDecoder().decode(bytes));
    toast.success("Original document loaded.");
  }

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.01em]">
          Create a list.
        </h1>
        <p className="mb-4 text-muted-foreground">
          Curated registry with an Accord court backing every dispute.
        </p>
        <Link
          to="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to lists.
        </Link>
      </header>

      {!signer ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Connect a wallet.</p>
          <p className="mb-5 text-muted-foreground">
            Creating a list signs with your wallet as the creator.
          </p>
        </div>
      ) : (
        <form className="flex flex-col gap-7" onSubmit={onSubmit}>
          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Rules document.
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
                  value={form.rulesDoc}
                  onValueChange={(v) => set("rulesDoc", v)}
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
                  help="64-hex sha256 of an already-authored rules document. Preview below verifies the bytes behind the hash."
                  placeholder="64 hex chars"
                  value={form.rulesHash}
                  onChange={(v) => set("rulesHash", v.trim())}
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
              The document is the list's public listing criteria — its sha256
              becomes the immutable on-chain rules hash (and the backing court's
              domain ref). After creation confirms, the document is published to
              the domain registry (ADR-0027).
            </p>
          </fieldset>

          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Mints.
            </legend>
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

          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Identity.
            </legend>
            <Field
              label="List program"
              help="Program whose accounts this list curates. Empty = ownership check disabled."
              placeholder="leave empty for arbitrary"
              value={form.listProgram}
              onChange={(v) => set("listProgram", v.trim())}
              mono
            />
          </fieldset>

          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Economics.
            </legend>
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

          <fieldset className="grid gap-4 rounded-lg border border-border p-5">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
              Windows (seconds).
            </legend>
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
            <p
              className="text-sm text-destructive font-mono text-sm text-foreground"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
            disabled={signingOrPublishing}
          >
            {publish.status === "pending"
              ? "Publishing rules document…"
              : sending
                ? "Signing…"
                : "Create list."}
          </button>
        </form>
      )}
    </main>
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
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground">
        {label}.{required ? " *" : ""}
      </span>
      <input
        className={`rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none ${mono ? "font-mono text-sm text-foreground" : ""}`}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {help && <span className="text-xs text-muted-foreground">{help}</span>}
    </label>
  );
}
