/**
 * ChallengePage.tsx — the Canon challenger's evidence authoring + submission UI.
 *
 * The challenger authors an evidence manifest (title + description markdown +
 * URL entries), the app hashes it → evidence_hash, encrypts + publishes to the
 * daemon, then sends the `challengeItem` instruction.
 *
 * Canon options are FIXED `[keep, remove]` — the challenger does NOT author
 * option labels. The description field IS the claim body (milestone §1(c), §6).
 *
 * Authority: SPEC §Instructions #4, ADR-0015 (evidence → SDK).
 */
import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { getAddressEncoder } from "@solana/kit";
import { getCanonItemDecoder, getCanonListDecoder } from "@useaccord/canon";
import { getSubaccordDecoder } from "@useaccord/sdk";
import { buildManifest } from "@useaccord/sdk/evidence";
import { useSigner } from "../../shared/rpc";
import { useClusterRpc } from "../../shared/rpc";
import { sendInstruction, TransactionSendError } from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import {
  prepareChallengeEvidence,
  buildChallengeInstruction,
  type ChallengeOnChainContext,
} from "./challengeFlow";

const EVIDENCE_DAEMON_URL =
  import.meta.env.VITE_EVIDENCE_DAEMON_URL ?? "http://localhost:8080";

export function ChallengePage() {
  const { address } = useParams<{ address: string }>();
  const { signer, ready } = useSigner();
  const clusterRpc = useClusterRpc();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entries, setEntries] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);

  const validEntries = entries.filter((e) => e.trim().length > 0);
  const isValid = title.trim().length > 0 && validEntries.length >= 1;

  // YAML preview (built from the same buffer that feeds the hash + encrypt).
  const yamlPreview = useMemo(() => {
    if (!isValid) return "";
    const salt = new Uint8Array(32); // placeholder for preview
    const buf = buildManifest(
      {
        salt,
        title: title.trim(),
        description: description.trim() || undefined,
        labels: ["keep", "remove"],
        entries: validEntries.map((e) => ({ path: e.trim() })),
      },
      // Placeholder ctx — real values filled at submit time.
      {
        dispute: "<derived>" as Address,
        subaccord: "<from list>" as Address,
        filer: "<list PDA>" as Address,
        filedAt: new Date().toISOString(),
      },
    );
    return new TextDecoder().decode(buf);
  }, [isValid, title, description, validEntries]);

  async function handleSubmit() {
    if (!address || !signer || !clusterRpc) return;
    setSubmitting(true);
    try {
      // 1. Fetch on-chain data (raw RPC + decoders — no facade needed).
      const itemRes = await clusterRpc.rpc
        .getAccountInfo(address as Address, { encoding: "base64" })
        .send();
      if (!itemRes.value) throw new Error("CanonItem account not found");
      const itemData = getCanonItemDecoder().decode(
        new Uint8Array(Buffer.from(itemRes.value.data[0]!, "base64")),
      );

      const listAddress = itemData.list;
      const listRes = await clusterRpc.rpc
        .getAccountInfo(listAddress, { encoding: "base64" })
        .send();
      if (!listRes.value) throw new Error("CanonList account not found");
      const listData = getCanonListDecoder().decode(
        new Uint8Array(Buffer.from(listRes.value.data[0]!, "base64")),
      );

      // 2. Fetch the Subaccord to get evidence_operator.
      const subRes = await clusterRpc.rpc
        .getAccountInfo(listData.subaccord, { encoding: "base64" })
        .send();
      if (!subRes.value) throw new Error("Subaccord account not found");
      const subData = getSubaccordDecoder().decode(
        new Uint8Array(Buffer.from(subRes.value.data[0]!, "base64")),
      );
      const operatorPub = new Uint8Array(
        getAddressEncoder().encode(subData.evidenceOperator),
      );

      const ctx: ChallengeOnChainContext = {
        list: listAddress,
        item: address as Address,
        listData,
        itemData,
        operatorPub,
      };

      // 3. Build manifest, hash, publish to daemon.
      const { evidenceHash } = await prepareChallengeEvidence(
        {
          title: title.trim(),
          description: description.trim(),
          entries: validEntries.map((e) => ({ path: e.trim() })),
        },
        ctx,
        { evidenceDaemonUrl: EVIDENCE_DAEMON_URL },
      );

      // 4. Build + send the challengeItem instruction.
      const ix = await buildChallengeInstruction(ctx, signer, evidenceHash);
      const sig = await sendInstruction(
        clusterRpc.rpc,
        clusterRpc.rpcSubscriptions,
        signer,
        ix,
      );
      toast.success(`Challenge filed! Signature: ${sig.slice(0, 8)}…`);
    } catch (err) {
      const msg =
        err instanceof TransactionSendError
          ? `Transaction failed: ${describeError(JSON.parse(err.message))}`
          : describeError(err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function addEntry() {
    setEntries([...entries, ""]);
  }
  function removeEntry(idx: number) {
    if (entries.length > 1) setEntries(entries.filter((_, i) => i !== idx));
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        to={`/items/${address}`}
        className="font-mono text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to item
      </Link>

      <h1 className="mt-4 font-heading text-2xl font-semibold text-foreground">
        Challenge Item
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        File a dispute. Your evidence is encrypted and submitted to jurors via
        the Schelling-point protocol. Options are fixed:{" "}
        <span className="font-mono text-amber">keep</span> /{" "}
        <span className="font-mono text-slash">remove</span>.
      </p>

      {!ready && (
        <p className="mt-6 text-sm text-muted-foreground">
          Connecting wallet…
        </p>
      )}
      {ready && !signer && (
        <p className="mt-6 text-sm text-amber">
          Connect a wallet to challenge this item.
        </p>
      )}

      {signer && (
        <div className="mt-6 space-y-5">
          {/* Title */}
          <div>
            <label className="mb-1 block font-mono text-sm text-muted-foreground">
              Challenge title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief title for this challenge"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>

          {/* Description (markdown claim body) */}
          <div>
            <label className="mb-1 block font-mono text-sm text-muted-foreground">
              Claim body (markdown)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="## Claim&#10;&#10;This item is fraudulent because…"
              rows={6}
              className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm focus:border-ring focus:outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Rendered as sanitized markdown for jurors. Raw bytes are never
              altered — sha256(manifest) is the on-chain commitment.
            </p>
          </div>

          {/* Evidence entries */}
          <div>
            <label className="mb-2 block font-mono text-sm text-muted-foreground">
              Evidence URLs
            </label>
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={entry}
                    onChange={(e) =>
                      setEntries(
                        entries.map((en, i) => (i === idx ? e.target.value : en)),
                      )
                    }
                    placeholder="https://example.com/evidence/claim.pdf"
                    className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
                  />
                  {entries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntry(idx)}
                      className="font-mono text-sm text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addEntry}
              className="mt-2 font-mono text-sm text-amber hover:underline"
            >
              + Add URL
            </button>
          </div>

          {/* YAML preview */}
          {yamlPreview && (
            <div>
              <label className="mb-1 block font-mono text-sm text-muted-foreground">
                manifest.yaml preview
              </label>
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs text-muted-foreground">
                {yamlPreview}
              </pre>
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            disabled={!isValid || submitting}
            onClick={handleSubmit}
            className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "Filing challenge…" : "File challenge"}
          </button>
        </div>
      )}
    </div>
  );
}
