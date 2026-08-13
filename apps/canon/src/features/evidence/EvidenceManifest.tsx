/**
 * EvidenceManifest.tsx — fetch + display the decrypted evidence manifest for a
 * disputed Canon item. Renders title, description (sanitized markdown), options,
 * and entries.
 *
 * The manifest is YAML (produced by `buildManifest`); the daemon returns it as
 * a raw UTF-8 string or parsed JSON. The description field is rendered as
 * sanitized markdown via `react-markdown` + `remark-gfm` — no raw HTML, links
 * open in a new tab with `rel=noopener`. Committed manifest bytes are NEVER
 * altered (sha256 is over the raw YAML).
 *
 * Authority: milestone §6 (description renders as markdown), ADR-0015.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseManifest, type ParsedManifest } from "@useaccord/sdk/evidence";
import { useManifest } from "./useManifest";

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
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-mono text-sm text-muted-foreground">
          Loading evidence…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-card p-4">
        <p className="font-mono text-sm text-destructive">
          Failed to load evidence: {String(error.message)}
        </p>
      </div>
    );
  }

  if (data === null || data === undefined) {
    return null;
  }

  const manifest: ParsedManifest =
    typeof data === "string"
      ? parseManifest(data)
      : parseManifest(JSON.stringify(data));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {/* Title */}
      <h3 className="font-heading text-lg font-semibold text-foreground">
        {manifest.title}
      </h3>

      {/* Description (sanitized markdown) */}
      {manifest.description && (
        <div className="prose prose-invert max-w-none text-sm text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
            }}
            skipHtml
          >
            {manifest.description}
          </ReactMarkdown>
        </div>
      )}

      {/* Options (canon-fixed: keep / remove) */}
      {manifest.options.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-xs text-muted-foreground">
            Options
          </p>
          <div className="flex gap-2">
            {manifest.options.map((opt) => (
              <span
                key={opt.index}
                className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground"
              >
                {opt.index}: {opt.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evidence entries */}
      {manifest.entries.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-xs text-muted-foreground">
            Evidence entries
          </p>
          <ul className="space-y-1">
            {manifest.entries.map((entry, i) => (
              <li key={i} className="font-mono text-xs text-foreground">
                <a
                  href={entry.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber hover:underline"
                >
                  {entry.path}
                </a>
                {entry.sha256 !== "0".repeat(64) && (
                  <span className="ml-2 text-muted-foreground">
                    sha256: {entry.sha256.slice(0, 12)}…
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata footer */}
      <div className="border-t border-border pt-2 font-mono text-xs text-muted-foreground">
        Filed {manifest.filedAt} · Filer {manifest.filer.slice(0, 8)}…
      </div>
    </div>
  );
}
