/**
 * evidence/PublishEvidence.tsx — detail-page "Publish evidence" recovery card.
 *
 * Additive to `DisputeDetail` (no existing detail-page logic touched). Lets a
 * filer recover from a failed/missed manifest publish by uploading the
 * `manifest.yaml` they downloaded at file time:
 *
 *   file-input → read bytes → verifyManifestHash(sha256 == evidenceHashes[0])
 *                              → publishEvidence (claimantEncrypt + POST).
 *
 * Idempotent: the daemon treats a re-POST of the same `plaintext_hash` as a
 * `201` no-op (store.ts put), so this also doubles as a re-publish after a
 * transient POST failure. The hash gate fails closed — a wrong manifest is
 * rejected before it ever reaches the network.
 *
 * Targets round 0 (filer evidence). Appeal-round evidence arrives via the
 * appeal instruction's `new_evidence_hash`, not this flow.
 *
 * Authority: milestone accord-ebel HANDOFF §1 recovery; ADR-0006/0011/0023.
 */
import { useState } from "react";
import {
  type Account,
  type ReadonlyUint8Array,
  getAddressEncoder,
} from "@solana/kit";
import { type Dispute, type Subaccord } from "@useaccord/sdk";

import { describeError } from "../../../shared/errors";
import {
  publishEvidence,
  verifyManifestHash,
} from "@useaccord/sdk/evidence";

import { EVIDENCE_DAEMON_URL } from "./config";
 import { queryClient } from "../../../shared/queryClient";

function isZeroHash(h: ReadonlyUint8Array): boolean {
  return h.every((b) => b === 0);
}

function readFileBytes(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((buf) => new Uint8Array(buf));
}

export function PublishEvidence({
  dispute,
  subaccord,
}: {
  dispute: Account<Dispute>;
  subaccord: Account<Subaccord>;
}) {
  // evidenceHashes[0] is the filer's round-0 manifest hash; all-zero sentinel
  // means no evidence manifest was filed (create_dispute got [0u8;32]).
  const round0Hash = dispute.data.evidenceHashes[0];
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<
    { kind: "ok"; fileName: string } | { kind: "err"; msg: string } | null
  >(null);

  // No round-0 hash on-chain ⇒ nothing to verify an upload against (the dispute
  // was filed with the zero sentinel, or the array is unexpectedly empty).
  if (!round0Hash || isZeroHash(round0Hash)) return null;
  // Capture the narrowed hash so the onFile closure sees a definite value.
  const evidenceHash = round0Hash;

  async function onFile(file: File) {
    setResult(null);
    setPublishing(true);
    try {
      const manifest = await readFileBytes(file);
      // Fails closed: a tampered / wrong manifest throws before any POST.
      await verifyManifestHash(manifest, new Uint8Array(evidenceHash));
      await publishEvidence({
        endpoint: EVIDENCE_DAEMON_URL,
        subaccord: subaccord.address,
        dispute: dispute.address,
        manifest,
        operatorPub: new Uint8Array(
          getAddressEncoder().encode(subaccord.data.evidenceOperator),
        ),
      });
      // The manifest query is cached (staleTime 60s) with data null — drop
      // it so the EvidenceManifest card above flips without a remount.
      void queryClient.invalidateQueries({ queryKey: ["manifest"] });
       setResult({ kind: "ok", fileName: file.name });
    } catch (err) {
      setResult({ kind: "err", msg: describeError(err) });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-raised p-4">
      <h2 className="mb-1 font-mono text-sm text-text-secondary">
        Publish evidence
      </h2>
      <p className="mb-3 text-sm text-text-secondary">
        Upload the <code className="font-mono">manifest.yaml</code> downloaded
        at file time to publish (or re-publish) the encrypted evidence package
        to the operator. The upload is checked against the on-chain round-0 hash
        before it is sent.
      </p>

      <input
        type="file"
        accept=".yaml,.yml"
        disabled={publishing}
        className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-amber file:px-3 file:py-2 file:font-medium file:text-ink hover:file:cursor-pointer disabled:opacity-50"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // reset so selecting the same file again still fires onChange
          e.target.value = "";
        }}
      />

      {publishing && (
        <p className="mt-3 font-mono text-xs text-text-secondary">
          Encrypting + publishing…
        </p>
      )}
      {result?.kind === "ok" && (
        <p className="mt-3 font-mono text-xs text-emerald-600">
          Published “{result.fileName}” — daemon 201 (idempotent on re-upload).
        </p>
      )}
      {result?.kind === "err" && (
        <p className="mt-3 font-mono text-xs text-slash">{result.msg}</p>
      )}
    </div>
  );
}
