import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Accord,
  INITIAL_NUM_JURORS,
  MAX_OPTIONS,
  findPauseStatePda,
  requiredFee,
} from "@useaccord/sdk";

import { useClusterRpc } from "../../shared/rpc";
import { sendInstruction } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import { useSigner } from "../../shared/wallet";
import { getAtaAddress } from "../../shared/tokens";
import { useTokenMeta } from "../../shared/useTokenMeta";
import { formatBigInt } from "../../shared/format";
import { useSubaccord } from "./useSubaccord";
import { useFeeTokenBalance } from "./useFeeTokenBalance";

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
  const [evidenceHash, setEvidenceHash] = useState("0".repeat(64));
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const sufficient = balance !== undefined && fee !== null && balance >= fee;
  const validOptions = options.filter(isValidHex32);
  const canSubmit =
    validOptions.length >= MIN_OPTIONS &&
    validOptions.length <= MAX_OPTIONS &&
    isValidHex32(evidenceHash) &&
    !!subaccord &&
    sufficient &&
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
    if (!signer) {
      setError("Connect a wallet to sign the create_dispute transaction.");
      return;
    }
    if (!crpc) {
      setError("No RPC cluster active.");
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

    if (balance === undefined) {
      setError("Fee-token balance not loaded yet.");
      return;
    }
    if (balance < fee) {
      setError("Insufficient fee-token balance to file this dispute.");
      return;
    }

    setSubmitting(true);
    try {
      const feeToken = subaccord.data.feeToken;
      const [pauseState] = await findPauseStatePda();
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
          pauseState,
        },
        {
          options: validOpts.map(hexToBytes32),
          evidenceHash: hexToBytes32(evidenceHash),
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
      navigate(`/disputes/${dispute}`);
    } catch (err) {
      setError(describeError(err));
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

        {/* Fee summary */}
        {fee !== null && (
          <div className="rounded-md border border-amber/30 bg-amber/5 p-3">
            <span className="font-mono text-xs text-text-secondary">
              Required fee ({INITIAL_NUM_JURORS} × fee per juror)
            </span>
            <p className="font-mono text-lg text-amber">
              {fee && decimals !== undefined
                ? `${formatBigInt(fee, decimals)} ${symbol}`
                : `${fee?.toString() ?? 0n} (raw)`}
            </p>
            {signer && feeToken && (
              <div className="mt-2 border-t border-amber/20 pt-2">
                <span className="font-mono text-xs text-text-secondary">
                  Your fee-token balance
                </span>
                <p
                  className={`font-mono ${
                    balanceLoading
                      ? "text-text-secondary"
                      : sufficient
                        ? "text-confirm"
                        : "text-slash"
                  }`}
                >
                  {balanceLoading
                    ? "loading…"
                    : (balance ?? 0n) === 0n
                      ? `0 ${symbol} (no ATA)`
                      : decimals !== undefined
                        ? `${formatBigInt(balance ?? 0n, decimals)} ${symbol}`
                        : `${(balance ?? 0n).toString()} (raw)`}
                </p>
              </div>
            )}
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
