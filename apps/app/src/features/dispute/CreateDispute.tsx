import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronRightIcon } from "lucide-react";
import {
  Accord,
  INITIAL_NUM_JURORS,
  MAX_OPTIONS,
  findDisputePda,
  findAccordStatePda,
  requiredFee,
} from "@useaccord/sdk";
import { type Address, getAddressEncoder } from "@solana/kit";

import { useClusterRpc } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { useSigner } from "../../shared/wallet";
import { getAtaAddress } from "../../shared/tokens";
import { useTokenMeta } from "../../shared/useTokenMeta";
import { formatBigInt } from "../../shared/format";
import { useSubaccord } from "./useSubaccord";
import { useFeeTokenBalance } from "./useFeeTokenBalance";
import {
  EvidenceEditor,
  downloadManifest,
  deriveOptionHashes,
  verifyOptionHashes,
  publishEvidence,
  EVIDENCE_DAEMON_URL,
  type EvidenceEditorOutput,
  type ManifestCtx,
} from "./evidence";
import {
  sha256,
  parseManifest,
  buildManifest,
  generateSalt,
} from "@useaccord/sdk/evidence";

function isValidHex32(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

function hexToBytes32(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomNonce(): string {
  return BigInt(Math.floor(Math.random() * 0xffffffff)).toString();
}

const MIN_OPTIONS = 2;

export function CreateDispute() {
  const { signer } = useSigner();
  const crpc = useClusterRpc();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subaccordAddr, setSubaccordAddr] = useState(
    searchParams.get("subaccord") || "",
  );
  const [nonce, setNonce] = useState(randomNonce());
  const [advanced, setAdvanced] = useState(false);

  // Manual manifest (advanced): paste a pre-authored manifest.yaml + its
  // option hashes instead of using the editor. The pasted bytes are hashed,
  // encrypted, and published exactly as authored.
  const [manual, setManual] = useState(false);
  const [manifestText, setManifestText] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  // Manifest state (the default flow).
  const [manifestOutput, setManifestOutput] =
    useState<EvidenceEditorOutput | null>(null);

  // Publish-failure recovery state.
  const [publishFail, setPublishFail] = useState<{
    error: string;
    dispute: string;
    manifest: Uint8Array;
  } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dispute PDA for manifest ctx (async — depends on signer + nonce).
  const filedAt = useRef(new Date().toISOString());
  const [disputePda, setDisputePda] = useState<string | null>(null);
  useEffect(() => {
    if (!signer) {
      setDisputePda(null);
      return;
    }
    let cancelled = false;
    try {
      findDisputePda({
        filer: signer.address,
        nonce: BigInt(nonce),
      })
        .then(([address]) => {
          if (!cancelled) setDisputePda(address);
        })
        .catch(() => {
          if (!cancelled) setDisputePda(null);
        });
    } catch {
      setDisputePda(null);
    }
    return () => {
      cancelled = true;
    };
  }, [signer, nonce]);

  // Manifest → option-hash sync (manual flow): derive
  // sha256(option_salt ‖ label_i) from the pasted manifest and fill any hash
  // input the filer hasn't hand-edited. Hashes are one-way — the manifest is
  // the source of truth; editing a hash by hand opts that slot out of sync.
  const derivedHashes = useRef<string[]>([]);
  useEffect(() => {
    if (!manual) return;
    const parsed = parseManifest(manifestText);
    const labels = parsed.options
      .filter((o) => o.label.trim())
      .map((o) => o.label)
      .slice(0, MAX_OPTIONS);
    if (!isValidHex32(parsed.optionSalt) || labels.length === 0) return;
    let cancelled = false;
    deriveOptionHashes(hexToBytes32(parsed.optionSalt), labels)
      .then((hashes) => {
        if (cancelled) return;
        const hex = hashes.map((h) =>
          Array.from(h, (b) => b.toString(16).padStart(2, "0")).join(""),
        );
        const prevDerived = derivedHashes.current;
        derivedHashes.current = hex;
        setOptions((prev) =>
          hex.map((h, i) => (!prev[i] || prev[i] === prevDerived[i] ? h : prev[i])),
        );
      })
      .catch(() => {
        /* derivation failed — leave hash inputs as-is */
      });
    return () => {
      cancelled = true;
    };
  }, [manual, manifestText]);

  const { data: subaccord } = useSubaccord(
    subaccordAddr.length > 32 ? subaccordAddr : undefined,
  );

  const feePerJuror = subaccord?.data.feePerJuror ?? 0n;
  const fee = feePerJuror > 0n ? requiredFee(feePerJuror) : null;
  const feeToken = subaccord?.data.feeToken;
  const { data: feeMeta } = useTokenMeta(feeToken);
  const decimals = feeMeta?.decimals;
  const symbol =
    feeMeta?.symbol ?? (feeToken ? `${feeToken.slice(0, 4)}…` : "???");
  const { data: balance, isLoading: balanceLoading } = useFeeTokenBalance(
    signer?.address,
    feeToken,
  );
  // Underfunded only when the balance is known and below the fee.
  const insufficient =
    !balanceLoading &&
    balance !== undefined &&
    fee !== null &&
    balance < fee;
  const sufficient = balance !== undefined && fee !== null && balance >= fee;

  /** Prefill the manual textarea with a valid `accord-evidence/v1` skeleton
   * built from the live ctx (real filer/subaccord/dispute, fresh salt). */
  function insertTemplate() {
    if (!manifestCtx) return;
    setManifestText(
      new TextDecoder().decode(
        buildManifest(
          {
            salt: generateSalt(),
            title: "Dispute title",
            labels: ["Option 0", "Option 1"],
            entries: [{ path: "https://example.com/evidence" }],
          },
          manifestCtx,
        ),
      ),
    );
  }

  const validOptions = options.filter(isValidHex32);

  const feeLabel =
    fee === null
      ? "—"
      : decimals !== undefined
        ? `${formatBigInt(fee, decimals)} ${symbol}`
        : `${fee.toString()} (raw)`;

  const canSubmit = (() => {
    if (submitting || !subaccord || !sufficient) return false;
    if (!manual) return manifestOutput !== null && disputePda !== null;
    return (
      validOptions.length >= MIN_OPTIONS &&
      validOptions.length <= MAX_OPTIONS &&
      manifestText.trim() !== ""
    );
  })();

  function addOption() {
    if (options.length < MAX_OPTIONS) {
      setOptions([...options, ""]);
    }
  }

  function removeOption(idx: number) {
    if (options.length > MIN_OPTIONS) {
      setOptions(options.filter((_, i) => i !== idx));
    }
  }

  function updateOption(idx: number, value: string) {
    setOptions(options.map((o, i) => (i === idx ? value : o)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!subaccord) {
      setError("Select a valid subaccord.");
      return;
    }
    if (!signer) {
      setError("Connect a wallet to sign the create_dispute transaction.");
      return;
    }
    if (!crpc) {
      setError("No RPC cluster active.");
      return;
    }
    if (!fee) {
      setError("Could not compute fee — check subaccord feePerJuror.");
      return;
    }
    if (balance === undefined) {
      setError("Fee-token balance not loaded yet.");
      return;
    }
    if (balance < fee) {
      setError("Insufficient fee-token balance to file this dispute.");
      return;
    }

    // --- flow-specific resolve ---
    let resolvedOptions: Uint8Array[] = [];
    let resolvedEvidenceHash: Uint8Array = new Uint8Array(32);
    let manifest: Uint8Array | null = null;

    if (!manual) {
      if (!manifestOutput) {
        setError("Complete the evidence manifest before submitting.");
        return;
      }
      // DOWNLOAD SYNCHRONOUSLY — before any await (browser gesture protection).
      downloadManifest(manifestOutput.manifest);
      manifest = manifestOutput.manifest;
    } else {
      // Manual manifest: hash the pasted bytes exactly as authored (no trim —
      // the committed hash must match the published bytes). No auto-download:
      // the filer already holds this file.
      if (!manifestText.trim()) {
        setError("Paste the manifest.yaml content (Advanced settings).");
        return;
      }
      const validOpts = options.filter(isValidHex32);
      if (validOpts.length < MIN_OPTIONS) {
        setError(`At least ${MIN_OPTIONS} valid option hashes required.`);
        return;
      }
      if (parseManifest(manifestText).options.length < MIN_OPTIONS) {
        setError(
          `Pasted manifest does not parse — it must list at least ${MIN_OPTIONS} options.`,
        );
        return;
      }
      resolvedOptions = validOpts.map(hexToBytes32);
      manifest = new TextEncoder().encode(manifestText);
      resolvedEvidenceHash = await sha256(manifest);
    }

    setSubmitting(true);
    try {
      // Manifest flow: derive option hashes + verify (async, after sync download).
      if (!manual && manifest && manifestOutput) {
        resolvedOptions = await deriveOptionHashes(
          manifestOutput.salt,
          manifestOutput.labels,
        );
        await verifyOptionHashes(
          manifestOutput.salt,
          manifestOutput.labels,
          resolvedOptions,
        );
        resolvedEvidenceHash = await sha256(manifest);
      }

      // --- SPINE (unchanged — only the source of options/evidenceHash differs) ---
      const feeToken = subaccord.data.feeToken;
      const [accordState] = await findAccordStatePda();
      const feeVault = await getAtaAddress(subaccord.address, feeToken);
      const filerTokenAccount = await getAtaAddress(signer.address, feeToken);

      const accord = new Accord({ endpoint: crpc.endpoint, signer });
      const { instruction, dispute } = await accord.methods.createDispute(
        {
          filer: signer.address,
          subaccord: subaccord.address,
          feeToken,
          filerTokenAccount,
          feeVault,
          accordState,
        },
        {
          options: resolvedOptions,
          evidenceHash: resolvedEvidenceHash,
          nonce: BigInt(nonce),
          fee,
        },
      );
      await sendInstruction(
        crpc.rpc,
        crpc.rpcSubscriptions,
        signer,
        instruction,
      );

      // Publish the encrypted manifest to the evidence daemon (both flows —
      // editor-authored and manually pasted — commit to a manifest).
      if (manifest) {
        const operatorBytes = new Uint8Array(
          getAddressEncoder().encode(subaccord.data.evidenceOperator),
        );
        try {
          await publishEvidence({
            endpoint: EVIDENCE_DAEMON_URL,
            subaccord: subaccord.address,
            dispute,
            manifest,
            operatorPub: operatorBytes,
          });
        } catch (publishErr) {
          // Dispute exists on-chain — stay on form for POST-only retry.
          setPublishFail({
            error: describeError(publishErr),
            dispute,
            manifest,
          });
          return;
        }
      }

      navigate(`/disputes/${dispute}`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryPublish() {
    if (!publishFail || !subaccord) return;
    setPublishing(true);
    try {
      const operatorBytes = new Uint8Array(
        getAddressEncoder().encode(subaccord.data.evidenceOperator),
      );
      await publishEvidence({
        endpoint: EVIDENCE_DAEMON_URL,
        subaccord: subaccord.address,
        dispute: publishFail.dispute,
        manifest: publishFail.manifest,
        operatorPub: operatorBytes,
      });
      navigate(`/disputes/${publishFail.dispute}`);
    } catch (err) {
      setPublishFail({ ...publishFail, error: describeError(err) });
    } finally {
      setPublishing(false);
    }
  }

  // Manifest ctx for EvidenceEditor.
  const manifestCtx: ManifestCtx | null =
    signer && subaccord && disputePda
      ? {
          dispute: disputePda as Address,
          subaccord: subaccord.address,
          filer: signer.address,
          filedAt: filedAt.current,
        }
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to="/disputes"
          className="font-mono text-sm text-text-secondary hover:text-text-primary"
        >
          ← All disputes
        </Link>
      </div>

      <h1 className="text-xl font-semibold">File a dispute.</h1>

      {/* Publish-failure recovery banner */}
      {publishFail && (
        <div className="rounded-md border border-slash/40 bg-slash/5 p-4">
          <p className="text-sm font-medium text-slash">
            Dispute created but evidence publish failed.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {publishFail.error}
          </p>
          <p className="mt-1 font-mono text-xs text-text-secondary">
            Dispute: {publishFail.dispute}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleRetryPublish}
              disabled={publishing}
              className="rounded-md bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Retry publish"}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/disputes/${publishFail.dispute}`)}
              className="rounded-md border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              View dispute
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Subaccord selector */}
        <div>
          <label className="mb-1 block font-mono text-sm text-text-secondary">
            Subaccord address
          </label>
          <input
            type="text"
            value={subaccordAddr}
            onChange={(e) => setSubaccordAddr(e.target.value)}
            placeholder="Subaccord PDA address"
            className="w-full rounded-md border border-border-subtle bg-raised px-3 py-2 font-mono text-sm text-text-primary placeholder:text-muted-foreground focus:border-amber focus:outline-none"
          />
          {subaccordAddr && !subaccord && (
            <p className="mt-1 text-sm text-slash">Subaccord not found.</p>
          )}
          {subaccord && (
            <div className="mt-2 rounded-md border border-border-subtle bg-raised p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-mono text-xs text-text-secondary">
                    Fee per juror
                  </span>
                  <p className="font-mono">
                    {decimals !== undefined
                      ? `${formatBigInt(subaccord.data.feePerJuror, decimals)} ${symbol}`
                      : `${subaccord.data.feePerJuror.toString()} (raw)`}
                  </p>
                </div>
                <div>
                  <span className="font-mono text-xs text-text-secondary">
                    Panel size
                  </span>
                  <p className="font-mono">{INITIAL_NUM_JURORS} jurors</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fee summary — note only when underfunded */}
        {fee !== null && (
          <div className="rounded-md border border-amber/30 bg-amber/5 p-3">
            <span className="font-mono text-xs text-text-secondary">
              Required fee ({INITIAL_NUM_JURORS} × fee per juror)
            </span>
            <p className="font-mono text-lg text-amber">{feeLabel}</p>
            {insufficient && (
              <p className="mt-2 border-t border-amber/20 pt-2 font-mono text-xs text-slash">
                Insufficient {symbol} balance —{" "}
                {decimals !== undefined
                  ? `${formatBigInt(balance ?? 0n, decimals)} ${symbol} available,`
                  : `${(balance ?? 0n).toString()} (raw) available,`}
                {feeLabel} required. Top up before filing.
              </p>
            )}
          </div>
        )}

        {/* Dispute essentials: the manifest editor (title, option labels,
            evidence URLs) — or a pointer to advanced when a manifest is
            provided manually. */}
        {manual ? (
          <div className="rounded-md border border-border-subtle bg-raised p-4">
            <h2 className="mb-2 font-mono text-sm text-text-secondary">
              Manually provided manifest.
            </h2>
            <p className="text-sm text-text-secondary">
              {manifestText.trim()
                ? `Parsed: “${parseManifest(manifestText).title}” — ${parseManifest(manifestText).options.length} options, ${parseManifest(manifestText).entries.length} entries. Option hashes + paste editing live in Advanced settings.`
                : "Paste your manifest.yaml and its option hashes in Advanced settings."}
            </p>
          </div>
        ) : manifestCtx ? (
          <div className="rounded-md border border-border-subtle bg-raised p-4">
            <h2 className="mb-3 font-mono text-sm text-text-secondary">
              Evidence manifest
            </h2>
            <EvidenceEditor ctx={manifestCtx} onChange={setManifestOutput} />
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            Connect a wallet and select a subaccord to author evidence.
          </p>
        )}

        <CollapsiblePrimitive.Root open={advanced} onOpenChange={setAdvanced}>
          <CollapsiblePrimitive.Trigger className="group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left font-mono text-sm text-text-secondary transition-colors hover:text-text-primary">
            <ChevronRightIcon
              className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-90"
              aria-hidden
            />
            Advanced settings
            <span className="text-xs font-normal text-text-secondary/70">
              manifest preview · manual manifest · nonce
            </span>
          </CollapsiblePrimitive.Trigger>
          <CollapsiblePrimitive.Content className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <div className="space-y-6 pt-5">
                {/* Manifest YAML preview + manual download (default flow) */}
                {!manual && manifestOutput && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="font-mono text-sm text-text-secondary">
                        manifest.yaml preview
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          downloadManifest(manifestOutput.manifest)
                        }
                        className="font-mono text-xs text-amber hover:underline"
                      >
                        ↓ Download
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-md border border-border-subtle bg-raised p-3 font-mono text-xs text-text-secondary">
                      {new TextDecoder().decode(manifestOutput.manifest)}
                    </pre>
                  </div>
                )}

                {/* Manual manifest */}
                <label className="flex cursor-pointer items-start gap-2 font-mono text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={manual}
                    onChange={(e) => setManual(e.target.checked)}
                  />
                  <span>
                    Provide the manifest manually.
                    <span className="mt-1 block text-xs font-normal text-text-secondary">
                      Paste a pre-authored manifest.yaml and its option hashes
                      instead of using the editor. The pasted bytes are hashed
                      (evidence_hash), encrypted, and published exactly as
                      authored — no submit-time re-download.
                    </span>
                  </span>
                </label>
                {manual && (
                  <>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="block font-mono text-sm text-text-secondary">
                          manifest.yaml
                        </label>
                        <button
                          type="button"
                          onClick={insertTemplate}
                          disabled={!manifestCtx}
                          title={
                            manifestCtx
                              ? "Insert a manifest template (live ctx, fresh salt)"
                              : "Connect a wallet and select a subaccord first"
                          }
                          className="font-mono text-xs text-amber hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Insert template
                        </button>
                      </div>
                      <textarea
                        value={manifestText}
                        onChange={(e) => setManifestText(e.target.value)}
                        placeholder="Paste the full manifest.yaml here"
                        rows={8}
                        spellCheck={false}
                        className="w-full rounded-md border border-border-subtle bg-raised px-3 py-2 font-mono text-xs text-text-primary placeholder:text-muted-foreground focus:border-amber focus:outline-none"
                      />
                      <span className="mt-1 block text-xs text-text-secondary">
                        Option hashes below auto-derive from this manifest's
                        option_salt + labels — edit a hash to override it.
                      </span>
                    </div>
                    <div>
                      <label className="mb-2 block font-mono text-sm text-text-secondary">
                        Option hashes ({validOptions.length}/{MAX_OPTIONS}, min{" "}
                        {MIN_OPTIONS})
                      </label>
                      <div className="space-y-2">
                        {options.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="w-6 font-mono text-xs text-text-secondary">
                              {idx}
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => updateOption(idx, e.target.value)}
                              placeholder={`${"0".repeat(64)} (64 hex chars)`}
                              className={`flex-1 rounded-md border bg-raised px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none ${
                                opt && !isValidHex32(opt)
                                  ? "border-slash"
                                  : isValidHex32(opt)
                                    ? "border-confirm/50"
                                    : "border-border-subtle focus:border-amber"
                              }`}
                            />
                            {options.length > MIN_OPTIONS && (
                              <button
                                type="button"
                                onClick={() => removeOption(idx)}
                                className="font-mono text-sm text-slash hover:text-text-primary"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {options.length < MAX_OPTIONS && (
                        <button
                          type="button"
                          onClick={addOption}
                          className="mt-2 font-mono text-sm text-amber hover:underline"
                        >
                          + Add option
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Nonce */}
                <div>
                  <label className="mb-1 block font-mono text-sm text-text-secondary">
                    Nonce (dispute namespace)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nonce}
                      onChange={(e) => setNonce(e.target.value)}
                      className="flex-1 rounded-md border border-border-subtle bg-raised px-3 py-2 font-mono text-sm focus:border-amber focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setNonce(randomNonce())}
                      className="rounded-md border border-border-subtle px-3 py-2 font-mono text-sm text-text-secondary hover:text-text-primary"
                    >
                      Randomize
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </CollapsiblePrimitive.Content>
        </CollapsiblePrimitive.Root>

        {/* Error */}
        {error && <p className="text-sm text-slash">{error}</p>}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-amber px-4 py-3 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "File dispute"}
        </button>
      </form>
    </div>
  );
}
