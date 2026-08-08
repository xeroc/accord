import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { INITIAL_NUM_JURORS, MAX_OPTIONS, requiredFee } from "@useaccord/sdk";

import { useSubaccord } from "./useSubaccord";

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length !== 64) return null;
  try {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  } catch {
    return null;
  }
}

function isValidHex32(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

function randomNonce(): string {
  return BigInt(Math.floor(Math.random() * 0xffffffff)).toString();
}

function formatFee(fee: bigint): string {
  return `${(Number(fee) / 1e9).toFixed(4)} SOL`;
}

const MIN_OPTIONS = 2;

export function CreateDispute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subaccordAddr, setSubaccordAddr] = useState(
    searchParams.get("subaccord") || "",
  );
  const [nonce, setNonce] = useState(randomNonce());
  const [evidenceHash, setEvidenceHash] = useState("0".repeat(64));
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: subaccord } = useSubaccord(
    subaccordAddr.length > 32 ? subaccordAddr : undefined,
  );

  const feePerJuror = subaccord?.data.feePerJuror ?? 0n;
  const fee = feePerJuror > 0n ? requiredFee(feePerJuror) : null;
  const validOptions = options.filter(isValidHex32);
  const canSubmit =
    validOptions.length >= MIN_OPTIONS &&
    validOptions.length <= MAX_OPTIONS &&
    isValidHex32(evidenceHash) &&
    !!subaccord &&
    !submitting;

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

    const validOpts = options.filter(isValidHex32);
    if (validOpts.length < MIN_OPTIONS) {
      setError(`At least ${MIN_OPTIONS} valid option hashes required.`);
      return;
    }

    if (!isValidHex32(evidenceHash)) {
      setError("Evidence hash must be 64 hex characters (32 bytes).");
      return;
    }

    if (!fee) {
      setError("Could not compute fee — check subaccord feePerJuror.");
      return;
    }

    setSubmitting(true);

    try {
      // ponytail: actual tx build + send requires ConnectorKit signer.
      // When wired: createDispute(client, accounts, { options, evidenceHash,
      // nonce, fee }) → instruction → sendInstruction → redirect.
      // For now: show the prepared tx info.
      setError(
        "Wallet connection required to sign the create_dispute transaction. " +
          "(ConnectorKit — accord-y5av)",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

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
                    {formatFee(subaccord.data.feePerJuror)}
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

        {/* Fee summary */}
        {fee !== null && (
          <div className="rounded-md border border-amber/30 bg-amber/5 p-3">
            <span className="font-mono text-xs text-text-secondary">
              Required fee ({INITIAL_NUM_JURORS} × fee per juror)
            </span>
            <p className="font-mono text-lg text-amber">{formatFee(fee)}</p>
          </div>
        )}

        {/* Options */}
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

        {/* Evidence hash */}
        <div>
          <label className="mb-1 block font-mono text-sm text-text-secondary">
            Evidence hash (defaults to all-zeros)
          </label>
          <input
            type="text"
            value={evidenceHash}
            onChange={(e) => setEvidenceHash(e.target.value)}
            className={`w-full rounded-md border bg-raised px-3 py-2 font-mono text-sm focus:outline-none ${
              isValidHex32(evidenceHash)
                ? "border-border-subtle focus:border-amber"
                : "border-slash"
            }`}
          />
        </div>

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
