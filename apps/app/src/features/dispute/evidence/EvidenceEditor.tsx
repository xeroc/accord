/**
 * evidence/EvidenceEditor.tsx — structured manifest authoring UI.
 *
 * Lets the filer author the `accord-evidence/v1` manifest: title, option
 * labels, and evidence URL entries. Shows a live read-only YAML preview
 * (serialized via `buildManifest` — the single buffer) and a Download button
 * for `manifest.yaml`.
 *
 * Emits `ManifestInput` upward via `onInput` on every change. The parent
 * (`CreateDispute`) owns the `ManifestCtx` (dispute PDA, subaccord, filer,
 * filedAt) and derives the on-chain commitments from the emitted input.
 *
 * Milestone §1, §3 (HANDOFF). The salt is generated once on mount and stays
 * stable — it feeds both option-hash derivation and the manifest.
 */
import { useEffect, useState } from "react";

import {
  buildManifest,
  generateSalt,
  type ManifestCtx,
  type ManifestInput,
} from "./index.js";

const MIN_LABELS = 2;
const MAX_LABELS = 8;

interface EvidenceEditorProps {
  /** Full context for manifest serialization. */
  ctx: ManifestCtx;
  /** Called with the current manifest input on every form change. */
  onInput: (input: ManifestInput) => void;
}

export function EvidenceEditor({ ctx, onInput }: EvidenceEditorProps) {
  const [title, setTitle] = useState("");
  const [labels, setLabels] = useState<string[]>(["", ""]);
  const [paths, setPaths] = useState<string[]>([""]);
  const [salt] = useState(() => generateSalt());

  const input: ManifestInput = {
    title,
    labels,
    entries: paths.map((path) => ({ path })),
    salt,
  };

  // Live YAML preview — same single buffer that feeds evidence_hash + encrypt.
  const manifestBytes = buildManifest(input, ctx);
  const yamlPreview = new TextDecoder().decode(manifestBytes);

  useEffect(() => {
    onInput(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, labels, paths, salt, onInput]);

  function downloadManifest() {
    // ponytail: copy into a fresh ArrayBuffer — TS 5.7+ types Uint8Array as
    // generic over buffer type; Blob requires ArrayBuffer-backed.
    const blob = new Blob([new Uint8Array(manifestBytes)], {
      type: "text/yaml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "manifest.yaml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label className="mb-1 block font-mono text-sm text-text-secondary">
          Dispute title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Milestone 3 (auth module) — delivered or not?"
          className="w-full rounded-md border border-border-subtle bg-raised px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-amber focus:outline-none"
        />
      </div>

      {/* Option labels */}
      <div>
        <label className="mb-2 block font-mono text-sm text-text-secondary">
          Option labels ({labels.length}/{MAX_LABELS}, min {MIN_LABELS})
        </label>
        <div className="space-y-2">
          {labels.map((label, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 font-mono text-xs text-text-secondary">
                {idx}
              </span>
              <input
                type="text"
                value={label}
                onChange={(e) =>
                  setLabels(
                    labels.map((l, i) => (i === idx ? e.target.value : l)),
                  )
                }
                placeholder={`Option ${idx} label (e.g. ${idx === 0 ? "Not delivered" : "Delivered"})`}
                className="flex-1 rounded-md border border-border-subtle bg-raised px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-amber focus:outline-none"
              />
              {labels.length > MIN_LABELS && (
                <button
                  type="button"
                  onClick={() => setLabels(labels.filter((_, i) => i !== idx))}
                  className="font-mono text-sm text-slash hover:text-text-primary"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {labels.length < MAX_LABELS && (
          <button
            type="button"
            onClick={() => setLabels([...labels, ""])}
            className="mt-2 font-mono text-sm text-amber hover:underline"
          >
            + Add option
          </button>
        )}
      </div>

      {/* Evidence entries */}
      <div>
        <label className="mb-2 block font-mono text-sm text-text-secondary">
          Evidence URLs
        </label>
        <div className="space-y-2">
          {paths.map((path, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="url"
                value={path}
                onChange={(e) =>
                  setPaths(
                    paths.map((p, i) => (i === idx ? e.target.value : p)),
                  )
                }
                placeholder="https://example.com/evidence/claim.md"
                className="flex-1 rounded-md border border-border-subtle bg-raised px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-amber focus:outline-none"
              />
              {paths.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPaths(paths.filter((_, i) => i !== idx))}
                  className="font-mono text-sm text-slash hover:text-text-primary"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPaths([...paths, ""])}
          className="mt-2 font-mono text-sm text-amber hover:underline"
        >
          + Add URL
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          Leaf sha256 defaults to all-zero sentinel — jurors skip per-file
          verification, root gate still applies.
        </p>
      </div>

      {/* YAML preview + download */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="font-mono text-sm text-text-secondary">
            manifest.yaml preview
          </label>
          <button
            type="button"
            onClick={downloadManifest}
            className="rounded-md border border-border-subtle px-3 py-1 font-mono text-xs text-text-secondary hover:border-amber hover:text-amber"
          >
            Download
          </button>
        </div>
        <pre className="max-h-64 overflow-auto rounded-md border border-border-subtle bg-raised p-3 font-mono text-xs text-text-primary">
          {yamlPreview}
        </pre>
      </div>
    </div>
  );
}
