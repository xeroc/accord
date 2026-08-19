/**
 * MarkdownText — the repo-wide sanitized markdown renderer (ADR-0027 read
 * path; supersedes the duplicated MarkdownDescription implementations).
 *
 * Security model (display-only — source bytes are never altered):
 *   - react-markdown does NOT render raw HTML by default (no `rehype-raw`),
 *     so `<script>`/`<img onerror>` in the source are escaped, not executed;
 *   - its default `urlTransform` strips unsafe protocols (`javascript:`);
 *   - links open in a new tab with `rel="noopener noreferrer"`.
 */
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "../internal/cn";

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

export function MarkdownText({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
