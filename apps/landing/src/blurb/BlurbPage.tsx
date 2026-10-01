// The blurb & brand kit page (unlisted route /blurb): fixed words, a
// forwardable email, the team, the brand files, the contact. Every
// copyable block is a CopyBlock — the mono label names what lands on the
// clipboard. Copy source: ./content.ts (provenance comments there).
import { AccordMark, Backdrop, useWallClockFrame } from "@useaccord/ui";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Footer } from "../components/Footer";
import {
  BRAND_ASSETS,
  BRAND_COLORS,
  BRAND_STORY,
  BRAND_TYPE,
  BRAND_USAGE,
  type BrandColor,
  CONTACT_EMAIL,
  EMAIL_BODY,
  EMAIL_FULL,
  EMAIL_SUBJECT,
  EMAIL_TO,
  EXPLAINERS,
  EXPLAINERS_INTRO,
  INTRO,
  KUDOS,
  MARK_ANATOMY,
  ONE_LINE,
  PERSONAS,
  SHORT_BLURB,
  STANDARD_BLURB,
  STATUS,
  TELEGRAM_URL,
  X_FABIAN_URL,
} from "./content";
import { ChatMessage, CopyBlock, EmailCard, TweetCard } from "./chrome";

/** shared mono file-button chrome (the CopyBlock button look) */
const FILE_BTN =
  "inline-flex min-h-9 items-center rounded-md border border-border bg-transparent px-3 " +
  "font-mono text-xs uppercase tracking-[0.08em] text-body transition-colors " +
  "duration-150 hover:border-amber hover:text-nearwhite";

/** copies a fixed string with the file-button chrome */
function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch((error: unknown) => console.error("copy failed", error));
  };
  return (
    <button type="button" className={FILE_BTN} onClick={onClick}>
      {copied ? `${label} copied` : `copy ${label}`}
    </button>
  );
}

/** fetches the served SVG and copies its source verbatim */
function CopySvgButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    fetch(url)
      .then((response) => response.text())
      .then((source) => navigator.clipboard?.writeText(source))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch((error: unknown) => console.error("svg copy failed", error));
  };
  return (
    <button type="button" className={FILE_BTN} onClick={onClick}>
      {copied ? "svg copied" : "copy svg"}
    </button>
  );
}

function Header() {
  // the shared ambient canvas — the same Backdrop the landing hero runs
  // on, wall-clock driven; frozen for reduced-motion visitors
  const backdropFrame = useWallClockFrame({ fps: 30 });
  return (
    <section className="relative isolate overflow-hidden py-24 sm:py-32">
      <Backdrop frame={backdropFrame} seed="blurb-hero" className="-z-10" aria-hidden={true} />
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" aria-label="Accord home" className="flex items-center gap-2.5">
            <AccordMark size={28} />
            <span className="font-mono text-sm font-medium tracking-tight text-nearwhite">
              Accord
            </span>
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            the blurb page
          </span>
        </div>
        <h1 className="max-w-[24ch] font-sans text-4xl font-medium tracking-[-0.01em] text-nearwhite sm:text-5xl">
          About Accord, ready to copy.
        </h1>
        <p className="max-w-[60ch] text-lg text-body">{INTRO}</p>
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-amber">{STATUS}</p>
      </div>
    </section>
  );
}

function WordsBand() {
  return (
    <Band label="the words">
      {/* the two chat-length blurbs side by side; the standard blurb
          always sits below, spanning the full content width */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CopyBlock label="one line — for chats" value={ONE_LINE} hint="paste into a chat">
          <ChatMessage
            author="Fabian Schuh"
            avatar="/people/fabian.webp"
            text={ONE_LINE}
            meta="forwarded message"
          />
        </CopyBlock>
        <CopyBlock label="short blurb — 70 words" value={SHORT_BLURB} hint="for a caption, a slide, a DM">
          <ChatMessage
            author="Fabian Schuh"
            avatar="/people/fabian.webp"
            text={SHORT_BLURB}
            meta="forwarded message"
          />
        </CopyBlock>
      </div>
      <CopyBlock
        label="standard blurb — 170 words"
        value={STANDARD_BLURB}
        hint="for a one-pager or a press paragraph"
      >
        <p className="m-0 max-w-[70ch] whitespace-pre-line text-left text-sm leading-relaxed text-body">
          {STANDARD_BLURB}
        </p>
      </CopyBlock>
    </Band>
  );
}

/** The explainers — the founder's short videos and talks, ordered by
 * what they explain (kicker ordinals), two per row. Each card quotes the
 * post with its native video embedded (poster frame + local mp4) when it
 * has one, plus an engagement stamp; the X glyph links to the source
 * post. The demo-day card carries the YouTube talk from its thread,
 * embedded inline. */
function ExplainerBand() {
  return (
    <Band label="the explainers">
      <p className="m-0 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {EXPLAINERS_INTRO}
      </p>
      <div className="grid items-start gap-6 sm:grid-cols-2">
        {EXPLAINERS.map((tweet) => (
          <figure key={tweet.url} className="flex w-full flex-col gap-3">
            <figcaption className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-amber">
                {tweet.kicker}
              </span>
              <span className="text-left text-sm text-muted-foreground">{tweet.note}</span>
            </figcaption>
            <TweetCard
              author="Fabian Schuh"
              handle="xer0c"
              avatar="/people/fabian.webp"
              text={tweet.text}
              date={tweet.date}
              meta={tweet.meta}
              media={
                tweet.media && tweet.mediaAlt
                  ? { src: tweet.media, alt: tweet.mediaAlt, video: tweet.video, autoPlay: true }
                  : undefined
              }
              maxChars={640}
              href={tweet.url}
            />
            {tweet.youtubeEmbed ? (
              <div className="flex flex-col gap-2">
                <iframe
                  src={tweet.youtubeEmbed}
                  title="Solana mtnDAO Demo Day (August 2026) — Accord and Mutual Risk Pools"
                  loading="lazy"
                  allowFullScreen
                  className="aspect-video w-full rounded-md border border-border"
                />
                {tweet.youtubeUrl ? (
                  <a
                    href={tweet.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit font-mono text-sm text-amber underline-offset-4 hover:underline"
                  >
                    full pitch on youtube ↗
                  </a>
                ) : null}
              </div>
            ) : null}
          </figure>
        ))}
      </div>
    </Band>
  );
}

function EmailBand() {
  return (
    <Band label="the email" tone="raised">
      <div className="w-full">
        <CopyBlock
          label="forwardable email — your voice"
          value={EMAIL_FULL}
          hint="adapt freely; keep the facts"
        >
          <EmailCard to={EMAIL_TO} subject={EMAIL_SUBJECT}>
            {EMAIL_BODY}
          </EmailCard>
        </CopyBlock>
      </div>
    </Band>
  );
}

function PersonaFigure({
  img,
  alt,
  caption,
  rows,
}: {
  img: string;
  alt: string;
  caption: string;
  rows: string[];
}) {
  return (
    <figure className="flex flex-col gap-4">
      <img src={img} alt={alt} className="h-64 w-auto rounded-lg border border-border object-cover" />
      <figcaption className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {caption}
      </figcaption>
      <div className="flex flex-col gap-2.5 pt-1">
        {rows.map((row) => (
          <div key={row} className="text-sm text-body">
            <span className="text-amber">▶</span> {row}
          </div>
        ))}
      </div>
    </figure>
  );
}

function TeamBand() {
  return (
    <Band label="the team">
      <div className="flex flex-wrap items-start gap-16">
        {PERSONAS.map((persona) => (
          <PersonaFigure key={persona.img} {...persona} />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <h3 className="m-0 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          track record
        </h3>
        <ul className="m-0 flex max-w-[64rem] flex-wrap gap-2 p-0">
          {KUDOS.map((kudo) => (
            <li
              key={kudo}
              className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground"
            >
              {kudo}
            </li>
          ))}
        </ul>
      </div>
    </Band>
  );
}

function ColorRow({ color }: { color: BrandColor }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border py-2 last:border-b-0">
      <span
        aria-hidden="true"
        className="h-8 w-8 shrink-0 rounded-md border border-border"
        style={{ backgroundColor: color.hex }}
      />
      <span className="flex min-w-[14ch] flex-1 flex-col">
        <span className="text-sm text-nearwhite">{color.name}</span>
        <span className="font-mono text-xs text-muted-foreground">{color.note}</span>
      </span>
      <span className="font-mono text-sm text-nearwhite">{color.hex}</span>
      <CopyValueButton value={color.hex} label="hex" />
    </li>
  );
}

function BrandBand() {
  return (
    <Band label="the brand" tone="raised">
      <div className="flex max-w-[70ch] flex-col gap-3">
        <p className="m-0 text-sm leading-relaxed text-body">{BRAND_STORY}</p>
        <p className="m-0 text-sm leading-relaxed text-body">{MARK_ANATOMY}</p>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">{BRAND_USAGE}</p>
      </div>
      <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BRAND_ASSETS.map((asset) => (
          <figure
            key={asset.id}
            className="flex flex-col gap-4 rounded-lg border border-border bg-raised p-4"
          >
            <div className="flex h-28 items-center justify-center">
              <img src={asset.svg} alt={`Accord ${asset.label}`} className="max-h-24 w-auto" />
            </div>
            <figcaption className="flex flex-1 flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {asset.label}
              </span>
              <span className="text-sm text-muted-foreground">{asset.note}</span>
            </figcaption>
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <a href={asset.svg} download className={FILE_BTN}>
                svg
              </a>
              <CopySvgButton url={asset.svg} />
            </div>
          </figure>
        ))}
      </div>
      <div className="flex flex-col gap-6">
        <h3 className="m-0 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          the colors
        </h3>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {BRAND_COLORS.map((group) => (
            <div key={group.group} className="flex flex-col gap-2">
              <h4 className="m-0 font-sans text-base font-medium text-nearwhite">{group.group}</h4>
              <ul className="m-0 flex list-none flex-col p-0">
                {group.colors.map((color) => (
                  <ColorRow key={`${group.group}-${color.name}`} color={color} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          the type
        </h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {BRAND_TYPE.map((face) => (
            <li key={face.name} className="flex flex-wrap items-baseline gap-3">
              <span className="min-w-[16ch] font-sans text-base font-medium text-nearwhite">
                {face.name}
              </span>
              <span className="text-sm text-muted-foreground">{face.role}</span>
              <span className="font-mono text-xs text-muted-foreground">SIL OFL</span>
            </li>
          ))}
        </ul>
      </div>
    </Band>
  );
}

function ContactBand() {
  return (
    <Band label="the contact">
      <div className="grid max-w-[64rem] gap-6 lg:grid-cols-3">
        <CopyBlock label="email" value={CONTACT_EMAIL}>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-left font-mono text-sm text-nearwhite underline-offset-4 hover:underline">
            {CONTACT_EMAIL}
          </a>
        </CopyBlock>
        <CopyBlock label="telegram — the room" value="t.me/useaccord">
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-left font-mono text-sm text-amber underline-offset-4 hover:underline"
          >
            t.me/useaccord
          </a>
        </CopyBlock>
        <CopyBlock label="x — the founder's build log" value="@xer0c">
          <a
            href={X_FABIAN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-left font-mono text-sm text-amber underline-offset-4 hover:underline"
          >
            @xer0c
          </a>
        </CopyBlock>
      </div>
    </Band>
  );
}

/** The section band — the landing's section rhythm (border-t, py-24/32,
 * max-w-5xl px-6 column) with the amber mono label on top. */
function Band({
  label,
  tone = "ink",
  children,
}: {
  label: string;
  tone?: "ink" | "raised";
  children: React.ReactNode;
}) {
  return (
    <section className={`border-t border-border/60 py-24 sm:py-32 ${tone === "raised" ? "bg-raised/40" : ""}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6">
        <h2 className="m-0 font-mono text-xs uppercase tracking-[0.08em] text-amber">{label}</h2>
        {children}
      </div>
    </section>
  );
}

export function BlurbPage() {
  return (
    <>
      <main>
        <Header />
        <WordsBand />
        <EmailBand />
        <ExplainerBand />
        <TeamBand />
        <BrandBand />
        <ContactBand />
      </main>
      <Footer />
    </>
  );
}
