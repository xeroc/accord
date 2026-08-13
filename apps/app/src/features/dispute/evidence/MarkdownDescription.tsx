/**
 * MarkdownDescription — render the manifest `description` field as sanitized
 * markdown (milestone §6, ADR-0017).
 *
 * Security model (display-only — committed manifest bytes are NEVER altered;
 * Jurors still verify `sha256(manifest) == evidence_hash` over the raw bytes):
 *   - react-markdown does NOT render raw HTML by default (no `rehype-raw`),
 *     so `<script>`/`<img onerror>` in the source are escaped, not executed;
 *   - its default `urlTransform` strips unsafe protocols (`javascript:`);
 *   - links open in a new tab with `rel="noopener noreferrer"`.
 *
 * Shared by apps/app's `EvidenceManifest`; apps/canon mirrors this when it is
 * scaffolded (milestone §5 — single source of truth via the shared evidence
 * module).
 */
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Anchor that always opens in a new tab with a safe `rel`. */
function SafeLink({
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

const components: Components = {
  a: SafeLink,
};

export function MarkdownDescription({ source }: { source: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
