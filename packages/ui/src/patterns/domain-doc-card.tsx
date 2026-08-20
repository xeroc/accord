/**
 * DomainDocCard — the one presentation for ADR-0027 domain docs (rules docs)
 * across apps/app and apps/canon.
 *
 * Read states (data in via props — this module is SDK-free; the app's
 * `useDomainDoc` hook owns fetch + verify):
 *   - loading · missing-404 (loud, with a `retry` action slot wired by the
 *     write path; pass `raw` when the doc text is still held locally — e.g.
 *     a failed post-confirm publish — to offer a Download of it) · tampered
 *     (sha256 verification failed) · ok (frontmatter title/description
 *     header + markdown body via MarkdownText).
 *
 * Editable mode (create flow / publish-retry ONLY): ONE textarea over the raw
 * doc text, with the YAML frontmatter visually emphasized as a distinct mono
 * block above it. Editing post-publish is impossible — `domain_ref` seeds the
 * PDA — so the textarea locks the moment `editable` flips to false (submit).
 */
import type { ReactNode } from "react";

import { Button } from "../primitives/button";
import { MarkdownText } from "../primitives/markdown-text";
import { cn } from "../internal/cn";

/** Template prefill for create forms: frontmatter + a Rules stub. */
export const DOMAIN_DOC_TEMPLATE =
  "---\ntitle: \ndescription: \n---\n\n## Rules\n";

/** Fetch-verify outcome rendered by the card. */
export type DomainDoc =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "tampered" }
  | {
      status: "ok";
      title?: string;
      description?: string;
      /** Markdown body (frontmatter stripped) — rendered via MarkdownText. */
      body: string;
      /** Raw doc bytes as text — feeds the download action. */
      raw: string;
    };

/** Extract the leading `---\n…\n---` frontmatter block, or null. */
function frontmatterBlock(raw: string): string | null {
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return raw.slice(0, end + 5);
}

/** Evidence-doc download pattern: blob → objectURL → anchor click → revoke. */
function downloadRawDoc(raw: string, filename: string) {
  const blob = new Blob([raw], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DomainDocCard({
  doc,
  hash,
  retry,
  editable,
  /** Locally-held raw doc text (authored but not published — e.g. a failed
   * post-confirm publish). Surfaces a Download action on the missing state. */
  raw,
  value,
  onValueChange,
  className,
}: {
  /** Fetch-verify outcome. Omit in editor-only contexts (pre-publish). */
  doc?: DomainDoc;
  /** On-chain hash — footer + download filename. */
  hash?: string;
  /** Action for the loud missing-doc state (write path wires retry/publish). */
  retry?: ReactNode;
  /** Editor mode: renders the raw-doc textarea; false after submit locks it. */
  editable?: boolean;
  /** Locally-held raw doc text (authored but not published — e.g. a failed
   * post-confirm publish). Surfaces a Download action on the missing state. */
  raw?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const shell = cn(
    "rounded-lg bg-card p-4 ring-1 ring-foreground/10",
    className,
  );

  if (editable !== undefined) {
    const frontmatter = value ? frontmatterBlock(value) : null;
    return (
      <section className={shell} data-testid="domain-doc-card">
        {frontmatter !== null && (
          <pre
            data-testid="domain-doc-frontmatter"
            className="mb-2 overflow-x-auto rounded-md bg-background p-2 font-mono text-xs text-muted-foreground"
          >
            {frontmatter}
          </pre>
        )}
        <textarea
          value={value}
          onChange={
            onValueChange === undefined
              ? undefined
              : (e) => onValueChange(e.target.value)
          }
          disabled={!editable}
          rows={14}
          spellCheck={false}
          aria-label="Domain document"
          className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground disabled:opacity-60"
        />
        {hash ? (
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
            {hash}
          </p>
        ) : null}
      </section>
    );
  }

  if (!doc || doc.status === "loading") {
    return (
      <section className={shell} data-testid="domain-doc-card">
        <p className="font-mono text-sm text-muted-foreground">
          Loading domain document…
        </p>
      </section>
    );
  }

  if (doc.status === "missing") {
    return (
      <section
        className={cn(shell, "ring-destructive/40")}
        data-testid="domain-doc-card"
      >
        <p className="font-mono text-sm text-destructive">
          Domain document not published — the on-chain hash has no bytes behind
          it.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hash ?? "unknown hash"}
        </p>
        {(retry || raw !== undefined) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {retry}
            {raw !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadRawDoc(raw, `${hash ?? "domain-doc"}.md`)
                }
              >
                Download
              </Button>
            )}
          </div>
        )}
      </section>
    );
  }
  if (doc.status === "tampered") {
    return (
      <section
        className={cn(shell, "ring-destructive/40")}
        data-testid="domain-doc-card"
      >
        <p className="font-mono text-sm text-destructive">
          Verification failed — the stored bytes do not hash to the on-chain
          reference. Do not trust this document.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hash ?? "unknown hash"}
        </p>
      </section>
    );
  }

  return (
    <section className={shell} data-testid="domain-doc-card">
      <header>
        {doc.title ? (
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {doc.title}
          </h3>
        ) : null}
        {doc.description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {doc.description}
          </p>
        ) : null}
      </header>
      <div className="mt-3">
        <MarkdownText source={doc.body} />
      </div>
      <footer className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2">
        <p className="break-all font-mono text-xs text-muted-foreground">
          {hash ?? ""}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => downloadRawDoc(doc.raw, `${hash ?? "domain-doc"}.md`)}
        >
          Download
        </Button>
      </footer>
    </section>
  );
}
