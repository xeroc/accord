/**
 * DomainDocPanel — read-path wiring for ADR-0027 domain docs (accord-n7x0).
 *
 * `useDomainDoc` wraps the SDK's single-source `fetchDomainDoc`
 * (GET → sha256 verify → parse) in a React Query hook cached by hash
 * (staleTime ∞ — CAS bytes are immutable). The panel maps the query onto
 * the `DomainDocCard` states; undefined hash (zero `rules_hash`) renders
 * nothing.
 *
 * Recovery publish: pass the backing `subaccord` and the missing state also
 * offers uploading the original file — bytes client-verified
 * (`sha256(bytes) == rules_hash`) then published via SDK `putDomainDoc`
 * (the daemon anchor-verifies `domain_ref == hash`; the PUT is
 * permissionless). Success invalidates the cached query so the card flips
 * to ok.
 */
import { useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address, ReadonlyUint8Array } from "@solana/kit";
import {
  fetchDomainDoc,
  putDomainDoc,
  verifyDomainDoc,
} from "@useaccord/sdk";
import { Button, DomainDocCard, type DomainDoc } from "@useaccord/ui";
import { toast } from "sonner";

import { describeError } from "@/shared/errors";
const EVIDENCE_DAEMON_URL =
  import.meta.env.VITE_EVIDENCE_DAEMON_URL ?? "http://localhost:8080";

/** Lowercase 64-hex of a 32-byte ref; undefined when the ref is all-zero. */
export function hexIfSet(
  bytes: ReadonlyUint8Array | Uint8Array | undefined,
): string | undefined {
  if (!bytes || bytes.length === 0 || bytes.every((b) => b === 0))
    return undefined;
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export function useDomainDoc(hash: string | undefined): {
  doc: DomainDoc | undefined;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: ["domain-doc", hash],
    queryFn: () => fetchDomainDoc(EVIDENCE_DAEMON_URL, hash!),
    enabled: Boolean(hash),
    retry: false,
    staleTime: Infinity,
  });
  if (!hash) return { doc: undefined, refetch: () => void q.refetch() };
  if (q.isPending)
    return { doc: { status: "loading" }, refetch: () => void q.refetch() };
  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : "";
    return {
      doc: /sha256 verification/i.test(msg)
        ? { status: "tampered" }
        : { status: "missing" },
      refetch: () => void q.refetch(),
    };
  }
  const { bytes, doc } = q.data;
  return {
    doc: {
      status: "ok",
      title: doc.title,
      description: doc.description,
      body: doc.body,
      raw: new TextDecoder().decode(bytes),
    },
    refetch: () => void q.refetch(),
  };
}

export function DomainDocPanel({
  hash,
  subaccord,
}: {
  hash: string | undefined;
  /** Backing Subaccord — the daemon PUT anchor. When set, the missing
   * state offers uploading + publishing the original rules document. */
  subaccord?: Address;
}) {
  const { doc, refetch } = useDomainDoc(hash);
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);

  /** Upload the original file: client-check sha256(bytes) == rules hash,
   * then publish against the backing Subaccord. */
  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !hash || !subaccord) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!verifyDomainDoc(bytes, hash)) {
      toast.error(
        "File does not hash to the on-chain rules hash — not the original document.",
      );
      return;
    }
    setPublishing(true);
    try {
      await putDomainDoc(EVIDENCE_DAEMON_URL, bytes, { subaccord });
      toast.success("Rules document published.");
      await queryClient.invalidateQueries({ queryKey: ["domain-doc", hash] });
    } catch (err) {
      toast.error(`Publish failed — ${describeError(err)}`);
    } finally {
      setPublishing(false);
    }
  }

  if (!hash || !doc) return null;
  const canUpload = doc.status === "missing" && subaccord !== undefined;
  return (
    <DomainDocCard
      doc={doc}
      hash={hash}
      retry={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            disabled={publishing}
          >
            Retry
          </Button>
          {canUpload && (
            <label
              className={
                "inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent" +
                (publishing ? " pointer-events-none opacity-60" : "")
              }
            >
              {publishing ? "Publishing…" : "Upload rules document"}
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => void onUpload(e)}
              />
            </label>
          )}
        </>
      }
    />
  );
}
