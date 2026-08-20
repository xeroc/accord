/**
 * DomainDocPanel — read-path wiring for ADR-0027 domain docs (accord-n7x0).
 *
 * `useDomainDoc` wraps the SDK's single-source `fetchDomainDoc`
 * (GET → sha256 verify → parse) in a React Query hook cached by hash
 * (staleTime ∞ — CAS bytes are immutable). The panel maps the query onto
 * the `DomainDocCard` states; undefined hash (zero `domain_ref`) renders
 * nothing.
 */
import { useQuery } from "@tanstack/react-query";
import type { ReadonlyUint8Array } from "@solana/kit";
import { fetchDomainDoc } from "@useaccord/sdk";
import { Button, DomainDocCard, type DomainDoc } from "@useaccord/ui";

import { EVIDENCE_DAEMON_URL } from "../dispute/evidence/config";

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

export function DomainDocPanel({ hash }: { hash: string | undefined }) {
  const { doc, refetch } = useDomainDoc(hash);
  if (!hash || !doc) return null;
  return (
    <DomainDocCard
      doc={doc}
      hash={hash}
      retry={
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      }
    />
  );
}
