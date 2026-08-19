/**
 * JoinCard — the joining party's evidence authoring + join submission
 * (accord-o6nn; canon ChallengePage pattern adapted to synod).
 *
 * The party authors an evidence manifest (title + description markdown + URL
 * entries), the app hashes it, encrypts + publishes the bundle to the daemon
 * (`POST /evidence/synod/:case/:slot` — pre-dispute grouping), then sends the
 * `join` instruction (stake `S` moves party ATA → vault, hash frozen into
 * `SynodCase.evidence[slot]`). Rendered when the connected wallet is an
 * unjoined party on an Opening case before the deadline.
 *
 * Authority: SPEC §Instructions #2, ADR-0015 (evidence → SDK), ADR-0017.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAddressEncoder, type Address, type TransactionSigner } from "@solana/kit";
import type { Subaccord } from "@useaccord/sdk";
import type { SynodCase } from "@useaccord/synod";

import { useSynod } from "@/shared/rpc";
import { describeError } from "@/shared/errors";
import { formatAmount } from "@/shared/format";
import {
  buildJoinManifest,
  joinEvidenceErrors,
  prepareJoinEvidence,
  buildJoinInstruction,
} from "./joinFlow";

const EVIDENCE_DAEMON_URL =
  import.meta.env.VITE_EVIDENCE_DAEMON_URL ?? "http://localhost:8080";

import {
  Field,
  FieldControl,
  FieldLabel,
  Input,
  Textarea,
} from "@useaccord/ui";

export function JoinCard({
  casePda,
  caseData,
  subData,
  party,
  slot,
}: {
  casePda: Address;
  caseData: SynodCase;
  subData: Subaccord;
  party: TransactionSigner;
  slot: number;
}) {
  const env = useSynod();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entries, setEntries] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const errors = joinEvidenceErrors({ title, description, entries });
  const ready = errors.length === 0;

  const operatorPub = useMemo(
    () => new Uint8Array(getAddressEncoder().encode(subData.evidenceOperator)),
    [subData.evidenceOperator],
  );
  const hasOperator = operatorPub.some((b) => b !== 0);

  const yamlPreview = useMemo(() => {
    if (!ready) return "";
    const buf = buildJoinManifest(
      { title, description, entries },
      {
        casePda,
        subaccord: caseData.subaccord,
        operatorPub,
        filer: party.address as Address,
        filedAt: new Date().toISOString(),
        roster: caseData.parties,
        partyCount: caseData.partyCount,
      },
      new Uint8Array(32), // placeholder salt — preview only
    );
    return new TextDecoder().decode(buf);
  }, [ready, title, description, entries, casePda, caseData, operatorPub, party]);

  async function onJoin() {
    setError(null);
    if (!env || !ready) return;
    if (!hasOperator) {
      setError(
        "This Subaccord has no evidence operator — evidence cannot be encrypted.",
      );
      return;
    }
    setSending(true);
    try {
      const ctx = {
        casePda,
        subaccord: caseData.subaccord,
        operatorPub,
        filer: party.address as Address,
        filedAt: new Date().toISOString(),
        roster: caseData.parties,
        partyCount: caseData.partyCount,
      };
      const { evidenceHash } = await prepareJoinEvidence(
        { title, description, entries },
        ctx,
        slot,
        { evidenceDaemonUrl: EVIDENCE_DAEMON_URL },
      );
      const ix = await buildJoinInstruction(
        { ...ctx, feeMint: subData.feeToken },
        party,
        evidenceHash,
      );
      await env.sendIx(ix);
      toast.success(
        `Joined — stake ${formatAmount(caseData.stake)} locked. Evidence frozen at slot ${slot}.`,
      );
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-border p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-amber">
        Join with evidence.
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Your manifest is encrypted to the court's evidence operator and its hash
        is committed on-chain at join — stake{" "}
        {formatAmount(caseData.stake)} locks into the case vault.
      </p>

      {!hasOperator && (
        <p className="mb-3 text-xs text-destructive" role="alert">
          This Subaccord has no evidence operator — evidence cannot be encrypted.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Title. *</FieldLabel>
          <FieldControl>
            <Input
              type="text"
              value={title}
              placeholder="What is this dispute about?"
              onChange={(e) => setTitle(e.target.value)}
            />
          </FieldControl>
        </Field>

        <Field>
          <FieldLabel>Claim (markdown).</FieldLabel>
          <FieldControl>
            <Textarea
              className="min-h-24 font-mono"
              value={description}
              placeholder="Your statement — jurors read this."
              onChange={(e) => setDescription(e.target.value)}
            />
          </FieldControl>
        </Field>

        {entries.map((e, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel>Entry {i + 1}.</FieldLabel>
              <FieldControl>
                <Input
                  className="font-mono"
                  type="text"
                  value={e}
                  placeholder="https://… (evidence reference)"
                  onChange={(ev) =>
                    setEntries((prev) =>
                      prev.map((p, j) => (j === i ? ev.target.value : p)),
                    )
                  }
                />
              </FieldControl>
            </Field>
            {entries.length > 1 && (
              <button
                type="button"
                className="mb-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() =>
                  setEntries((prev) => prev.filter((_, j) => j !== i))
                }
                aria-label={`Remove entry ${i + 1}`}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setEntries((prev) => [...prev, ""])}
        >
          + Add entry.
        </button>

        {errors.map((err) => (
          <p key={err} className="text-xs text-destructive" role="alert">
            {err}
          </p>
        ))}

        {ready && yamlPreview && (
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">
              Manifest preview (YAML).
            </summary>
            <pre className="max-h-56 overflow-auto px-3 pb-3 font-mono text-xs text-muted-foreground">
              {yamlPreview}
            </pre>
          </details>
        )}

        {error && (
          <p className="font-mono text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="inline-flex w-fit items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
          disabled={!ready || !env || !hasOperator || sending}
          onClick={() => void onJoin()}
        >
          {sending ? "Signing…" : `Join — stake ${formatAmount(caseData.stake)}.`}
        </button>
      </div>
    </section>
  );
}
