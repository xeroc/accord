import {
  Button,
  Field,
  FieldControl,
  FieldLabel,
  Input,
} from "@useaccord/ui";

/**
 * EvidenceEditor.tsx — structured form for authoring the `accord-evidence/v1`
 * manifest. Collects title, option labels, and URL entries; builds the
 * manifest buffer (single serialization) and propagates it via onChange.
 * The YAML preview + download button live in CreateDispute's advanced
 * settings, not here — this component is the essentials-only authoring surface.
 *
 * Authority: milestone accord-ebel §1 (manifest submit), §2 (module contract),
 * §3 (single-buffer invariant — buildManifest runs once in useMemo, that same
 * Uint8Array feeds hash + encrypt downstream).
 */
import { useMemo, useEffect, useRef, useState } from "react";

import {
  buildManifest,
  generateSalt,
  type ManifestCtx,
  type ManifestInput,
} from "@useaccord/sdk/evidence";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;
const MIN_ENTRIES = 1;

export interface EvidenceEditorOutput {
  /** The single manifest buffer — feeds sha256→evidence_hash + claimantEncrypt→POST. */
  manifest: Uint8Array;
  /** Option labels in order. */
  labels: string[];
  /** The per-dispute salt (already embedded in manifest). */
  salt: Uint8Array;
}

interface EvidenceEditorProps {
  ctx: ManifestCtx;
  /** Called with the output when valid, or null when invalid. */
  onChange: (output: EvidenceEditorOutput | null) => void;
}

export function downloadManifest(manifest: Uint8Array) {
  const blob = new Blob([new Uint8Array(manifest)], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "manifest.yaml";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function EvidenceEditor({ ctx, onChange }: EvidenceEditorProps) {
  // Salt is generated once and kept stable across edits.
  const salt = useRef(generateSalt());

  const [title, setTitle] = useState("");
  const [labels, setLabels] = useState<string[]>(["", ""]);
  const [entries, setEntries] = useState<string[]>([""]);

  const validLabels = labels.filter((l) => l.trim().length > 0);
  const validEntries = entries.filter((e) => e.trim().length > 0);
  const isValid =
    title.trim().length > 0 &&
    validLabels.length >= MIN_OPTIONS &&
    validLabels.length <= MAX_OPTIONS &&
    validEntries.length >= MIN_ENTRIES;

  // Single-buffer invariant: buildManifest runs once per input change.
  // That same Uint8Array feeds the YAML preview here and (via onChange) the
  // hash + encrypt downstream. Never re-serialize.
  const manifest = useMemo(() => {
    if (!isValid) return null;
    const input: ManifestInput = {
      salt: salt.current,
      title: title.trim(),
      labels: validLabels.map((l) => l.trim()),
      entries: validEntries.map((e) => ({ path: e.trim() })),
    };
    return buildManifest(input, ctx);
  }, [isValid, title, validLabels, validEntries, ctx]);

  // Propagate output to parent.
  useEffect(() => {
    if (manifest && isValid) {
      onChange({
        manifest,
        labels: validLabels.map((l) => l.trim()),
        salt: salt.current,
      });
    } else {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, isValid]);

  function addLabel() {
    if (labels.length < MAX_OPTIONS) setLabels([...labels, ""]);
  }
  function removeLabel(idx: number) {
    if (labels.length > MIN_OPTIONS)
      setLabels(labels.filter((_, i) => i !== idx));
  }
  function addEntry() {
    setEntries([...entries, ""]);
  }
  function removeEntry(idx: number) {
    if (entries.length > MIN_ENTRIES)
      setEntries(entries.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      {/* Title */}
      <Field>
        <FieldLabel>Dispute title</FieldLabel>
        <FieldControl>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dispute title"
          />
        </FieldControl>
      </Field>

      {/* Option labels */}
      <div>
        <FieldLabel className="mb-2">
          Option labels ({validLabels.length}/{MAX_OPTIONS}, min {MIN_OPTIONS})
        </FieldLabel>
        <div className="space-y-2">
          {labels.map((label, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 font-mono text-xs text-text-secondary">
                {idx}
              </span>
              <Input
                value={label}
                onChange={(e) =>
                  setLabels(
                    labels.map((l, i) => (i === idx ? e.target.value : l)),
                  )
                }
                placeholder={`Option ${idx} label (e.g. ${idx === 0 ? "Not delivered" : "Delivered"})`}
                className="flex-1"
              />
              {labels.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeLabel(idx)}
                  className="font-mono text-sm text-slash hover:text-text-primary"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {labels.length < MAX_OPTIONS && (
          <Button
            type="button"
            variant="link"
            className="mt-2 w-fit font-mono font-normal"
            onClick={addLabel}
          >
            + Add option
          </Button>
        )}
      </div>

      {/* Evidence entries (URLs) */}
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
                    entries.map((en, i) => (i === idx ? e.target.value : en)),
                  )
                }
                placeholder="https://example.com/evidence/claim.pdf"
                className="flex-1"
              />
              {entries.length > MIN_ENTRIES && (
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="font-mono text-sm text-slash hover:text-text-primary"
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
    </div>
  );
}
