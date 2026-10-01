// The blurb-page chrome — the copyable-block vocabulary, ported from the
// riprap blurb (../riprap/apps/landing/src/blurb + @riprap/ui chrome) and
// restyled onto the Accord tokens (ink-dominant, amber accent, IBM Plex).
// Local to this route on purpose: only the blurb uses these; the shared
// kit (@useaccord/ui) stays product-facing. Data law, unchanged from the
// origin: every value arrives as a prop, verbatim — nothing here edits,
// summarizes, or invents content, and nothing here fetches.
import { useEffect, useRef, useState, type ReactNode } from "react";

/** the X glyph — currentColor; sized/colored by its parent */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** first letters of the first two words — the no-avatar fallback tile */
function initials(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * `CopyBlock` — a labeled, copyable block: a mono stamp naming what lands
 * on the clipboard ("one line — for chats"), the content as children, and
 * a copy button in the header row. Copy feedback is word-swap only.
 */
export function CopyBlock({
  label,
  value,
  hint,
  children,
}: {
  /** mono label naming what is copied */
  label: string;
  /** the exact string placed on the clipboard */
  value: string;
  /** optional mono hint beside the copy button, e.g. "paste into a chat" */
  hint?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  // Revert timer belongs to this component: clear on unmount so it never
  // fires into a torn-down environment; clear before re-arming so a second
  // copy keeps the full 2s.
  const revertRef = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(revertRef.current), []);

  const onCopy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        clearTimeout(revertRef.current);
        setCopied(true);
        revertRef.current = window.setTimeout(() => setCopied(false), 2000);
      })
      .catch((error: unknown) => console.error("copy-block copy failed", error));
  };

  return (
    <article className="flex w-full flex-col gap-3 rounded-lg border border-border bg-raised p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="m-0 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </h3>
        <div className="flex items-baseline gap-3">
          {hint ? (
            <span className="font-mono text-xs text-muted-foreground/70">{hint}</span>
          ) : null}
          <button
            type="button"
            onClick={onCopy}
            className="font-mono text-xs uppercase tracking-[0.08em] text-amber transition-colors hover:text-nearwhite"
          >
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>
      </header>
      {children}
    </article>
  );
}

/**
 * `ChatMessage` — one chat message: sender row (avatar disc or initials
 * tile) and the message in a hairline bubble. For the one-liner someone
 * forwards into a group chat.
 */
export function ChatMessage({
  author,
  text,
  meta,
  avatar,
}: {
  /** sender display name, e.g. "Fabian" */
  author: string;
  /** the message, verbatim; \n preserved */
  text: string;
  /** mono stamp under the bubble, e.g. "forwarded message" */
  meta?: string;
  /** avatar image URL/path; omit for the initials tile */
  avatar?: string;
}) {
  return (
    <article className="flex w-full max-w-[60ch] flex-col gap-3">
      <div className="flex items-center gap-3">
        {avatar ? (
          <img
            src={avatar}
            alt={`avatar of ${author}`}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted-foreground"
          >
            {initials(author)}
          </span>
        )}
        <span className="truncate text-sm font-medium text-nearwhite">{author}</span>
      </div>
      <p className="m-0 w-full whitespace-pre-line rounded-lg border border-border bg-ink px-4 py-3 text-left text-sm leading-relaxed text-body">
        {text}
      </p>
      {meta ? (
        <p className="m-0 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {meta}
        </p>
      ) : null}
    </article>
  );
}

/**
 * `TweetCard` — a quoted tweet rendered as the real thing: author row with
 * avatar and mono handle, verbatim body (truncating at `maxChars` with an
 * ellipsis), the tweet's native video (poster frame + local mp4) or photo,
 * and a date/engagement stamp. The X glyph top-right links to the source
 * post — the card itself stays an article, interactive media never nests
 * in a link.
 */
export function TweetCard({
  author,
  handle,
  text,
  date,
  avatar,
  media,
  meta,
  maxChars = 140,
  href,
}: {
  author: string;
  handle: string;
  text: string;
  date: string;
  avatar?: string;
  media?: { src: string; alt: string; video?: string; autoPlay?: boolean };
  meta?: string;
  maxChars?: number;
  href?: string;
}) {
  // word-for-word from the kit law: no motion dep — check the query directly
  const auto =
    media?.autoPlay === true &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clipped = text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
  return (
    <article className="flex w-full flex-col gap-3 rounded-lg border border-border bg-raised p-5">
      <div className="flex w-full items-center gap-3">
        {avatar ? (
          <img
            src={avatar}
            alt={`avatar of ${author}`}
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border font-mono text-sm text-muted-foreground"
          >
            {initials(author)}
          </span>
        )}
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-nearwhite">{author}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            @{handle}
          </span>
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`view @${handle}'s post on x`}
            className="ml-1 shrink-0 text-nearwhite transition-opacity hover:opacity-70"
          >
            <XLogo className="h-5 w-5" />
          </a>
        ) : (
          <XLogo className="ml-1 h-5 w-5 shrink-0 text-muted-foreground" />
        )}
      </div>
      <p className="m-0 w-full whitespace-pre-line text-left text-sm leading-relaxed text-body">
        {clipped}
      </p>
      {media?.video ? (
        <video
          src={media.video}
          poster={media.src}
          aria-label={media.alt}
          controls
          playsInline
          preload="metadata"
          autoPlay={auto || undefined}
          muted={auto || undefined}
          className="aspect-video w-full rounded-md border border-border bg-black"
        />
      ) : media ? (
        <img
          src={media.src}
          alt={media.alt}
          className="aspect-video w-full rounded-md border border-border object-cover"
        />
      ) : null}
      <p className="m-0 flex w-full items-baseline justify-between gap-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <span className="shrink-0">{date}</span>
        {meta ? <span>{meta}</span> : null}
      </p>
    </article>
  );
}

/**
 * `EmailCard` — a compose frame: mono field labels (to / subject) with
 * their values, a hairline rule, then the body verbatim.
 */
export function EmailCard({
  to,
  subject,
  children,
}: {
  to: string;
  subject: string;
  children: ReactNode;
}) {
  return (
    <article className="flex w-full flex-col gap-3 rounded-lg border border-border bg-raised p-5">
      <div className="flex items-baseline gap-3">
        <span className="w-16 shrink-0 text-right font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          to
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-nearwhite">{to}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="w-16 shrink-0 text-right font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          subject
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-nearwhite">{subject}</span>
      </div>
      <div className="border-t border-border pt-4">
        <div className="whitespace-pre-line text-left text-sm leading-relaxed text-body">
          {children}
        </div>
      </div>
    </article>
  );
}
