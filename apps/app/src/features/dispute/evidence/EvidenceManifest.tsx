/**
 * EvidenceManifest — fetch + display the decrypted evidence manifest for a
 * dispute round. Renders the manifest metadata (title, options, entries) in a
 * polished card for jurors and the public to inspect.
 *
 * The manifest is YAML (produced by `buildManifest`); the daemon returns it as
 * a raw UTF-8 string. This component parses the known `accord-evidence/v1`
 * format with a targeted parser — no YAML dependency needed.
 */
import { Copyable, MarkdownText } from "@useaccord/ui";
import { useManifest } from "./useManifest";
import { parseManifest, type ParsedManifest } from "@useaccord/sdk/evidence";

export function EvidenceManifest({
  subaccord,
  dispute,
  round,
}: {
  subaccord: string;
  dispute: string;
  round: number;
}) {
  const { data, isLoading, error } = useManifest(subaccord, dispute, round);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border-subtle bg-raised p-4">
        <p className="font-mono text-sm text-text-secondary">
          Loading manifest…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border-subtle bg-raised p-4">
        <h2 className="mb-1 font-mono text-sm text-text-secondary">
          Evidence manifest
        </h2>
        <p className="text-sm text-slash">
          Failed to load:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </p>
      </div>
    );
  }

  if (data === null || data === undefined) {
    return (
      <div className="rounded-lg border border-border-subtle bg-raised p-4">
        <h2 className="mb-1 font-mono text-sm text-text-secondary">
          Evidence manifest
        </h2>
        <p className="text-sm text-muted-foreground">
          No manifest published for round {round}.
        </p>
      </div>
    );
  }

  // The daemon returns a YAML string (JSON.parse fails on YAML) or a parsed
  // object if the plaintext was JSON. Handle both.
  const manifest: ParsedManifest =
    typeof data === "string"
      ? parseManifest(data)
      : parseManifest(JSON.stringify(data));

  return (
    <div className="space-y-4 rounded-lg border border-border-subtle bg-raised p-4">
      {/* Title */}
      <div>
        <h2 className="font-mono text-xs text-text-secondary">
          Evidence manifest
        </h2>
        <p className="mt-1 text-lg font-semibold">{manifest.title}</p>
      </div>

      {/* Description (sanitized markdown — display-only, never alters committed bytes) */}
      {manifest.description && <MarkdownText source={manifest.description} />}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="font-mono text-xs text-text-secondary">
            Filed at
          </span>
          <p className="mt-0.5">
            {manifest.filedAt === "—"
              ? "—"
              : new Date(manifest.filedAt).toLocaleString()}
          </p>
        </div>
        <div>
          <span className="font-mono text-xs text-text-secondary">Filer</span>
          <p className="mt-0.5">
            <Copyable value={manifest.filer} head={6} tail={6} />
          </p>
        </div>
      </div>

      {/* Options */}
      {manifest.options.length > 0 && (
        <div>
          <h3 className="mb-2 font-mono text-xs text-text-secondary">
            Options
          </h3>
          <div className="space-y-1.5">
            {manifest.options.map((opt) => (
              <div
                key={opt.index}
                className="flex items-center gap-3 rounded border border-border-subtle px-3 py-1.5"
              >
                <span className="w-6 shrink-0 font-mono text-xs text-text-secondary">
                  {opt.index}
                </span>
                <span className="text-sm">{opt.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence entries */}
      {manifest.entries.length > 0 && (
        <div>
          <h3 className="mb-2 font-mono text-xs text-text-secondary">
            Evidence entries ({manifest.entries.length})
          </h3>
          <div className="space-y-1.5">
            {manifest.entries.map((entry, idx) => {
              const isZero = entry.sha256 === "0".repeat(64);
              return (
                <div
                  key={idx}
                  className="rounded border border-border-subtle px-3 py-1.5"
                >
                  <p className="break-all text-sm">{entry.path}</p>
                  <p className="mt-0.5 font-mono text-xs text-text-secondary">
                    {isZero
                      ? "sha256: unknown (root-gated)"
                      : `sha256: ${entry.sha256.slice(0, 16)}…`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collapsible raw YAML for power users */}
      {typeof data === "string" && (
        <details className="group">
          <summary className="cursor-pointer font-mono text-xs text-text-secondary hover:text-text-primary">
            ▸ Raw manifest (YAML)
          </summary>
          <pre className="mt-2 overflow-x-auto rounded border border-border-subtle bg-ink p-3 font-mono text-xs text-text-secondary">
            {data}
          </pre>
        </details>
      )}
    </div>
  );
}
