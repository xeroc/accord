/**
 * domain.ts — domain document convention (ADR-0027, milestone accord-lgof).
 *
 * Canon defines a Subaccord's 32-byte `domain_ref` / a CanonList's
 * `rules_hash` as `sha256(rules_doc)` where `rules_doc` is the raw file bytes
 * (YAML frontmatter included). This module is the convention's single home:
 * hashing, frontmatter parsing (zero deps), verification against the on-chain
 * field, and the daemon fetch pipeline (`GET /domains/{hash}` → verify →
 * parse). The daemon itself is a format-blind CAS — it never parses; this
 * module does.
 *
 * Recommended format: markdown with optional YAML frontmatter carrying
 * `title` / `description`; the body is the rules (`version` was dropped — the
 * hash is the version, ADR-0027 amendment). Any other bytes are valid opaque
 * content — hash-verified, `body`-only.
 */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

/** Parsed domain document: optional frontmatter metadata + the body. */
export interface ParsedDomainDoc {
  title?: string;
  description?: string;
  body: string;
}

/** Result of fetching a domain doc from the daemon: verified bytes + parse. */
export interface FetchedDomainDoc {
  bytes: Uint8Array;
  contentType: string;
  doc: ParsedDomainDoc;
}

/** Options for {@link putDomainDoc} (ADR-0027 amendment — chain-anchored PUT). */
export interface PutDomainDocOptions {
  /**
   * Anchor Subaccord address (`?subaccord=`): the daemon resolves it
   * on-chain and requires its `domain_ref` to equal the doc hash
   * (create-first — publish only after the create-tx confirms).
   */
  subaccord: string;
  /** Content-Type for the PUT; defaults to `text/markdown`. */
  contentType?: string;
}

/** Success result of {@link putDomainDoc}: 201 created / 200 idempotent no-op. */
export interface PutDomainDocResult {
  status: 200 | 201;
  /** The doc's canonical 64-hex sha256 — the on-chain `domain_ref` value. */
  hash: string;
}

/**
 * Typed failure of {@link putDomainDoc}: the daemon rejected the publish.
 * `status` mirrors the daemon's HTTP status (400 hash/anchor mismatch /
 * missing param, 404 anchor not found, 409 collision alarm, 413 over cap,
 * 5xx transport); `body` carries the raw response body for the message.
 */
export class DomainPublishError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`domain daemon rejected publish with ${status}: ${body}`);
    this.name = "DomainPublishError";
    this.status = status;
    this.body = body;
  }
}

const FRONTMATTER_DELIM = "---";
const HEX64 = /^[0-9a-fA-F]{64}$/;

/** `sha256(bytes)` as lowercase 64-hex — the canonical `domain_ref` string form. */
export function hashDomainDoc(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/**
 * Verify raw doc bytes against an on-chain `domain_ref` — either the 32 raw
 * bytes or its 64-hex string form. False on any mismatch or wrong ref shape.
 */
export function verifyDomainDoc(
  bytes: Uint8Array,
  domainRef: Uint8Array | string,
): boolean {
  const digest = sha256(bytes);
  if (typeof domainRef === "string") {
    return (
      HEX64.test(domainRef) && domainRef.toLowerCase() === bytesToHex(digest)
    );
  }
  if (domainRef.length !== 32) return false;
  return domainRef.every((b, i) => b === digest[i]);
}

/**
 * Parse a domain doc: optional `---`-delimited frontmatter with `title` /
 * `description` (single-line `key: value`, surrounding quotes stripped),
 * everything after the closing delimiter is `body`. Absent or unterminated
 * frontmatter ⇒ the whole text is `body`.
 */
export function parseDomainDoc(bytes: Uint8Array): ParsedDomainDoc {
  const text = new TextDecoder().decode(bytes);
  const split = splitFrontmatter(text);
  if (!split) return { body: text };
  const meta = parseFrontmatter(split.frontmatter);
  return { ...meta, body: split.body };
}

/**
 * Fetch a domain doc from the evidence daemon (`GET {daemonUrl}/domains/{hash}`),
 * verify `sha256(bytes) === hash`, and parse it. Throws on non-200 responses
 * and on verification failure (tampered or mismatched bytes).
 */
export async function fetchDomainDoc(
  daemonUrl: string,
  hash: string,
): Promise<FetchedDomainDoc> {
  const res = await fetch(`${daemonUrl.replace(/\/+$/, "")}/domains/${hash}`);
  if (!res.ok) {
    throw new Error(`domain daemon returned ${res.status} for ${hash}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!verifyDomainDoc(bytes, hash)) {
    throw new Error(`domain doc ${hash} failed sha256 verification`);
  }
  return {
    bytes,
    contentType: res.headers.get("content-type") ?? "text/markdown",
    doc: parseDomainDoc(bytes),
  };
}

/**
 * Publish a domain doc to the evidence daemon's public CAS
 * (`PUT {daemonUrl}/domains/{sha256(bytes)}?subaccord=<addr>`) — the single
 * publish implementation; the CLI and both dApps consume this (ADR-0027
 * amendment, bean accord-uecf). Create-first: call only after the create-tx
 * with `domain_ref = hash` has confirmed — the daemon anchor-verifies.
 * Resolves `{ status, hash }` on 201 (created) / 200 (identical bytes already
 * stored — idempotent no-op); throws {@link DomainPublishError} on any other
 * status, carrying `status` + raw body.
 */
export async function putDomainDoc(
  daemonUrl: string,
  bytes: Uint8Array,
  options: PutDomainDocOptions,
): Promise<PutDomainDocResult> {
  const hash = hashDomainDoc(bytes);
  const res = await fetch(
    `${daemonUrl.replace(/\/+$/, "")}/domains/${hash}?subaccord=${encodeURIComponent(options.subaccord)}`,
    {
      method: "PUT",
      headers: { "content-type": options.contentType ?? "text/markdown" },
      // ponytail: cast — base lib.dom's BodyInit predates generic
      // Uint8Array<ArrayBufferLike>; no copy needed for a valid body.
      body: bytes as unknown as BodyInit,
    },
  );
  if (res.status === 200 || res.status === 201) {
    return { status: res.status, hash };
  }
  throw new DomainPublishError(res.status, await res.text());
}

/** Split `---\n…\n---\n<body>`; null when there is no (well-formed) frontmatter. */
function splitFrontmatter(
  text: string,
): { frontmatter: string; body: string } | null {
  if (!text.startsWith(FRONTMATTER_DELIM)) return null;
  let rest = text.slice(FRONTMATTER_DELIM.length);
  if (rest.startsWith("\r\n")) rest = rest.slice(2);
  else if (rest.startsWith("\n")) rest = rest.slice(1);
  else return null; // `---` is body content (e.g. a thematic break), not a delimiter
  const lines = rest.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const bare = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (bare === FRONTMATTER_DELIM) {
      return {
        frontmatter: lines.slice(0, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return null; // unterminated frontmatter — treat whole text as body
}

/** Line-based `key: value` scan of the frontmatter block (title/description only). */
function parseFrontmatter(text: string): Partial<ParsedDomainDoc> {
  const out: Partial<ParsedDomainDoc> = {};
  for (const line of text.split("\n")) {
    const bare = line.endsWith("\r") ? line.slice(0, -1) : line;
    const idx = bare.indexOf(":");
    if (idx <= 0) continue;
    const key = bare.slice(0, idx).trim();
    const value = unquote(bare.slice(idx + 1).trim());
    if (!value) continue;
    if (key === "title") out.title = value;
    else if (key === "description") out.description = value;
  }
  return out;
}

function unquote(s: string): string {
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))
  ) {
    return s.slice(1, -1);
  }
  return s;
}
