import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Textarea,
} from "@useaccord/ui";
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
import { ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { getBase64Encoder, getAddressEncoder } from "@solana/kit";
import { getSubaccordDecoder, findDisputePda } from "@useaccord/sdk";
import { fetchSubaccordRaw } from "../../shared/rpc";
import { fetchCanonItem, fetchCanonList } from "../../shared/fetch";
import { buildManifest } from "@useaccord/sdk/evidence";
import { useSigner } from "../../shared/rpc";
import { useClusterRpc } from "../../shared/rpc";
import {
  sendInstruction,
  TransactionSendError,
} from "../../shared/transaction";
import { describeError } from "../../shared/errors";
import {
  buildChallengeEvidence,
  buildChallengeInstruction,
  publishChallengeEvidence,
  type ChallengeOnChainContext,
} from "./challengeFlow";
import { DomainDocPanel, hexIfSet } from "../domain/DomainDocPanel";
import { explorerAccountUrl } from "../../shared/explorer";
import { formatBps, formatTokenAmount } from "../../shared/format";

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
  const [publishFail, setPublishFail] = useState<{
    error: string;
    ctx: ChallengeOnChainContext;
    dispute: Address;
    manifest: Uint8Array;
  } | null>(null);

  const validEntries = entries.filter((e) => e.trim().length > 0);
  const isValid = title.trim().length > 0 && validEntries.length >= 1;

  // On-chain context for the preview: item → list → backing court (economics)
  // → the dispute PDA the next challenge will use (["dispute", list,
  // list.dispute_count]). Fetched at page load so the preview + the cost
  // breakdown show REAL values; submit re-fetches for freshness.
  const { data: previewCtx } = useQuery({
    queryKey: ["challenge-ctx", address],
    queryFn: async () => {
      if (!address || !clusterRpc) return null;
      const itemData = await fetchCanonItem(clusterRpc.rpc, address as Address);
      if (!itemData) return null;
      const listData = await fetchCanonList(clusterRpc.rpc, itemData.list);
      if (!listData) return null;
      const subaccord = await fetchSubaccordRaw(
        clusterRpc.rpc,
        listData.subaccord,
      );
      if (!subaccord) return null;
      const [dispute] = await findDisputePda({
        filer: itemData.list,
        nonce: listData.disputeCount,
      });
      return {
        list: itemData.list,
        listData,
        itemData,
        court: subaccord.data,
        dispute,
      };
    },
    enabled: !!address && !!clusterRpc,
    retry: false,
    staleTime: 30_000,
  });

  // --- Challenge economics (mirrors on-chain math exactly) ---
  // challenge_item: stake = challenge_pct × accumulated_stake / 10_000, plus
  // Accord filing_fee = min_jury_size × fee_per_juror (jury pay). settle_item:
  // remove pays the challenger the whole pot (accumulated + own stake back);
  // keep forfeits the stake into the item's accumulated protection.
  const econ = useMemo(() => {
    if (!previewCtx) return null;
    const { listData, itemData, court } = previewCtx;
    const stake =
      (BigInt(listData.challengePct) * itemData.accumulatedStake) / 10_000n;
    const juryFee = BigInt(court.minJurySize) * court.feePerJuror;
    return {
      stake,
      juryFee,
      total: stake + juryFee,
      pot: itemData.accumulatedStake,
      jurySize: court.minJurySize,
      feePerJuror: court.feePerJuror,
      challengePct: listData.challengePct,
    };
  }, [previewCtx]);
  // YAML preview (real ctx; salt + entry sha256 zeroed — minted at submit).
  const yamlPreview = useMemo(() => {
    if (!isValid || !previewCtx) return "";
    const buf = buildManifest(
      {
        salt: new Uint8Array(32), // placeholder for preview
        title: title.trim(),
        description: description.trim() || undefined,
        labels: ["keep", "remove"],
        entries: validEntries.map((e) => ({ path: e.trim() })),
      },
      {
        dispute: previewCtx.dispute,
        subaccord: previewCtx.listData.subaccord,
        // Canon is the single filer (ADR-0004): the CanonList PDA signs the
        // create_dispute CPI — NOT the challenger wallet (wallet is rent_payer).
        filer: previewCtx.list,
        filedAt: new Date().toISOString(),
      },
    );
    return new TextDecoder().decode(buf);
  }, [isValid, title, description, validEntries, previewCtx]);

  async function handleSubmit() {
    if (!address || !signer || !clusterRpc) return;
    setSubmitting(true);
    try {
      // 1. Fetch on-chain data (shared fetchers: raw RPC + decoders).
      const itemData = await fetchCanonItem(clusterRpc.rpc, address as Address);
      if (!itemData) throw new Error("CanonItem account not found");

      const listAddress = itemData.list;
      const listData = await fetchCanonList(clusterRpc.rpc, listAddress);
      if (!listData) throw new Error("CanonList account not found");

      // 2. Fetch the Subaccord to get evidence_operator.
      const subRes = await clusterRpc.rpc
        .getAccountInfo(listData.subaccord, { encoding: "base64" })
        .send();
      if (!subRes.value) throw new Error("Subaccord account not found");
      const subData = getSubaccordDecoder().decode(
        getBase64Encoder().encode(subRes.value.data[0]!),
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

      // 3. Build the manifest + evidence_hash offline (no daemon call yet).
      const { evidenceHash, manifest, dispute } = await buildChallengeEvidence(
        {
          title: title.trim(),
          description: description.trim(),
          entries: validEntries.map((e) => ({ path: e.trim() })),
        },
        ctx,
      );

      // 4. Send the challengeItem transaction FIRST — it CPIs create_dispute,
      //    and the daemon's ingest reads the dispute on-chain (404 "dispute
      //    not found" if evidence arrives before the dispute exists).
      const ix = await buildChallengeInstruction(ctx, signer, evidenceHash);
      const sig = await sendInstruction(
        clusterRpc.rpc,
        clusterRpc.rpcSubscriptions,
        signer,
        ix,
      );

      // 5. Publish the encrypted manifest — the dispute now exists on-chain.
      try {
        await publishChallengeEvidence(manifest, dispute, ctx, {
          evidenceDaemonUrl: EVIDENCE_DAEMON_URL,
        });
        setPublishFail(null);
        toast.success(`Challenge filed! Signature: ${sig.slice(0, 8)}…`);
      } catch (publishErr) {
        // Dispute exists on-chain — hold the manifest for a POST-only retry.
        setPublishFail({
          error: describeError(publishErr),
          ctx,
          dispute,
          manifest,
        });
        toast.error(
          `Dispute filed (${sig.slice(0, 8)}…) but evidence publish failed — retry below`,
        );
      }
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

  /** POST-only retry: the dispute is already on-chain; re-publish the SAME
   * manifest bytes (the on-chain evidence_hash commits to them). */
  async function handleRetryPublish() {
    if (!publishFail) return;
    setSubmitting(true);
    try {
      await publishChallengeEvidence(
        publishFail.manifest,
        publishFail.dispute,
        publishFail.ctx,
        { evidenceDaemonUrl: EVIDENCE_DAEMON_URL },
      );
      setPublishFail(null);
      toast.success("Evidence published — challenge complete.");
    } catch (err) {
      setPublishFail({ ...publishFail, error: describeError(err) });
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

      {/* The item being challenged — the curated account itself */}
      {previewCtx && (
        <div className="mt-6 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            The item being challenged
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="break-all font-mono text-base text-foreground">
              {previewCtx.itemData.account}
            </span>
            <a
              href={explorerAccountUrl(previewCtx.itemData.account)}
              target="_blank"
              rel="noreferrer"
              aria-label="View on explorer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      )}

      {/* Challenge economics — mirrors on-chain math (challenge_item + filing_fee) */}
      {econ && (
        <div className="mt-4 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            What this challenge costs
          </p>
          <dl className="mt-3 grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">
                Challenge stake ({formatBps(econ.challengePct, 0)} of the pot)
              </dt>
              <dd className="text-right font-mono">
                {formatTokenAmount(econ.stake)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">
                Juror fees ({econ.jurySize} jurors ×{" "}
                {formatTokenAmount(econ.feePerJuror)})
              </dt>
              <dd className="text-right font-mono">
                {formatTokenAmount(econ.juryFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm font-semibold">
              <dt>Total locked from your wallet</dt>
              <dd className="text-right font-mono">
                {formatTokenAmount(econ.total)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">
                Pot if jurors rule remove — yours (your stake returns with it)
              </dt>
              <dd className="text-right font-mono">
                {formatTokenAmount(econ.pot)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs italic text-muted-foreground">
            If jurors rule keep, your stake is forfeited and added to the
            item's protection — later challenges must then post a larger stake.
          </p>
        </div>
      )}
      {/* Rules document (ADR-0027): the rules this challenge is judged under */}
      {previewCtx?.listData && (
        <div className="mt-6">
          <DomainDocPanel hash={hexIfSet(previewCtx.listData.rulesHash)} />
        </div>
      )}

      {!ready && (
        <p className="mt-6 text-sm text-muted-foreground">Connecting wallet…</p>
      )}
      {ready && !signer && (
        <p className="mt-6 text-sm text-amber">
          Connect a wallet to challenge this item.
        </p>
      )}

      {signer && (
        <div className="mt-6 space-y-5">
          {/* Title */}
          <Field>
            <FieldLabel>Challenge title</FieldLabel>
            <FieldControl>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief title for this challenge"
              />
            </FieldControl>
          </Field>

          {/* Description (markdown claim body) */}
          <Field>
            <FieldLabel>Claim body (markdown)</FieldLabel>
            <FieldControl>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="## Claim&#10;&#10;This item is fraudulent because…"
                rows={6}
                className="font-mono"
              />
            </FieldControl>
            <FieldDescription>
              Rendered as sanitized markdown for jurors. Raw bytes are never
              altered — sha256(manifest) is the on-chain commitment.
            </FieldDescription>
          </Field>

          {/* Evidence entries */}
          <div>
            <FieldLabel className="mb-2">Evidence URLs</FieldLabel>
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="url"
                    value={entry}
                    onChange={(e) =>
                      setEntries(
                        entries.map((en, i) =>
                          i === idx ? e.target.value : en,
                        ),
                      )
                    }
                    placeholder="https://example.com/evidence/claim.pdf"
                    className="flex-1"
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
            <Button
              type="button"
              variant="link"
              className="mt-2 w-fit font-mono font-normal"
              onClick={addEntry}
            >
              + Add URL
            </Button>
          </div>

          {/* YAML preview */}
          {yamlPreview && (
            <div>
              <FieldLabel>manifest.yaml preview</FieldLabel>
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs text-muted-foreground">
                {yamlPreview}
              </pre>
            </div>
          )}

          {/* Publish failure — dispute is on-chain; retry POSTs the same manifest */}
          {publishFail && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <p className="font-mono text-destructive">
                Dispute filed, but evidence publish failed:
              </p>
              <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                {publishFail.error}
              </p>
              <Button
                type="button"
                variant="link"
                className="mt-2 w-fit font-mono font-normal"
                onClick={handleRetryPublish}
                loading={submitting}
              >
                {submitting ? "Publishing…" : "Retry evidence publish"}
              </Button>
            </div>
          )}
          <Button
            type="button"
            disabled={!isValid}
            onClick={handleSubmit}
            loading={submitting}
          >
            {submitting ? "Filing challenge…" : "File challenge"}
          </Button>
        </div>
      )}
    </div>
  );
}
