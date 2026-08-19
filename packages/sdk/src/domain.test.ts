// domain.test.ts — domain document convention self-check (ADR-0027,
// milestone accord-lgof).
//
// Proves the public surface of src/domain.ts: sha256 CAS hashing (RFC 6234
// known-answer), the zero-dep frontmatter parser (present / absent /
// unterminated / quoted values), verifyDomainDoc against both the string
// (64-hex) and Uint8Array (32-byte) domain_ref shapes, and fetchDomainDoc's
// fetch → verify → parse pipeline (including tampered-bytes and non-200
// failures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";

import {
  DomainPublishError,
  fetchDomainDoc,
  hashDomainDoc,
  parseDomainDoc,
  putDomainDoc,
  verifyDomainDoc,
} from "./domain.ts";

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// hashDomainDoc
// ---------------------------------------------------------------------------

test("hashDomainDoc is deterministic and 64 hex chars", () => {
  const bytes = enc.encode("# Rules\n\nbody text");
  const a = hashDomainDoc(bytes);
  const b = hashDomainDoc(bytes);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  // and equals plain noble sha256 (no exotic framing)
  assert.equal(a, Buffer.from(nobleSha256(bytes)).toString("hex"));
});

// ---------------------------------------------------------------------------
// parseDomainDoc
// ---------------------------------------------------------------------------

test("parseDomainDoc extracts title/description; legacy version key is ignored", () => {
  const doc = enc.encode(
    "---\ntitle: Curated Rules\ndescription: The rules\nversion: 2\n---\n# Body\n",
  );
  const parsed = parseDomainDoc(doc);
  assert.equal(parsed.title, "Curated Rules");
  assert.equal(parsed.description, "The rules");
  // version was dropped from the convention (ADR-0027 amendment — the hash
  // is the version); a legacy key must not leak into the parse.
  assert.equal((parsed as Record<string, unknown>).version, undefined);
  assert.equal(parsed.body, "# Body\n");
});

test("parseDomainDoc: absent frontmatter yields only body", () => {
  const parsed = parseDomainDoc(enc.encode("# Just markdown\n"));
  assert.equal(parsed.body, "# Just markdown\n");
  assert.equal(parsed.title, undefined);
  assert.equal(parsed.description, undefined);
});

test("parseDomainDoc: unterminated frontmatter is treated as body", () => {
  const text = "---\ntitle: no closer\n";
  const parsed = parseDomainDoc(enc.encode(text));
  assert.equal(parsed.body, text);
  assert.equal(parsed.title, undefined);
});

test("parseDomainDoc: quoted values are unquoted", () => {
  const parsed = parseDomainDoc(
    enc.encode(
      "---\ntitle: \"Quoted Title\"\ndescription: 'Single'\n---\nbody",
    ),
  );
  assert.equal(parsed.title, "Quoted Title");
  assert.equal(parsed.description, "Single");
});

test("parseDomainDoc: empty frontmatter block yields empty body after it", () => {
  const parsed = parseDomainDoc(enc.encode("---\n---\n"));
  assert.equal(parsed.body, "");
  assert.equal(parsed.title, undefined);
});

// ---------------------------------------------------------------------------
// verifyDomainDoc
// ---------------------------------------------------------------------------

test("verifyDomainDoc: matching Uint8Array ref is true, mismatched is false", () => {
  const doc = enc.encode("domain doc bytes");
  const ref = nobleSha256(doc);
  assert.equal(verifyDomainDoc(doc, ref), true);
  const bad = new Uint8Array(ref);
  bad[0] ^= 0xff;
  assert.equal(verifyDomainDoc(doc, bad), false);
  // wrong-length ref can never verify
  assert.equal(verifyDomainDoc(doc, ref.slice(0, 31)), false);
});

test("verifyDomainDoc: matching 64-hex string ref is true, mismatched is false", () => {
  const doc = enc.encode("domain doc bytes");
  const hash = hashDomainDoc(doc);
  assert.equal(verifyDomainDoc(doc, hash), true);
  // uppercase still verifies (hash comparison is case-insensitive)
  assert.equal(verifyDomainDoc(doc, hash.toUpperCase()), true);
  const flipped = (hash[0] === "0" ? "1" : "0") + hash.slice(1);
  assert.equal(verifyDomainDoc(doc, flipped), false);
});

// ---------------------------------------------------------------------------
// fetchDomainDoc
// ---------------------------------------------------------------------------

function stubFetch(impl: typeof fetch): void {
  globalThis.fetch = impl;
}

test("fetchDomainDoc fetches, verifies, parses", async () => {
  const bytes = enc.encode("---\ntitle: T\n---\nbody");
  const hash = hashDomainDoc(bytes);
  const orig = globalThis.fetch;
  stubFetch((async (input: RequestInfo | URL) => {
    assert.equal(String(input), `http://daemon.test/domains/${hash}`);
    return new Response(bytes, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }) as typeof fetch);
  try {
    const got = await fetchDomainDoc("http://daemon.test/", hash);
    assert.deepEqual(got.bytes, bytes);
    assert.equal(got.contentType, "text/markdown; charset=utf-8");
    assert.equal(got.doc.title, "T");
    assert.equal(got.doc.body, "body");
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetchDomainDoc: tampered bytes fail sha256 verification", async () => {
  const hash = hashDomainDoc(enc.encode("real"));
  const orig = globalThis.fetch;
  stubFetch((async () => new Response(enc.encode("tampered"))) as typeof fetch);
  try {
    await assert.rejects(fetchDomainDoc("http://daemon.test", hash), /sha256/i);
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetchDomainDoc: non-200 throws with status", async () => {
  const hash = hashDomainDoc(enc.encode("x"));
  const orig = globalThis.fetch;
  stubFetch((async () => new Response(null, { status: 404 })) as typeof fetch);
  try {
    await assert.rejects(fetchDomainDoc("http://daemon.test", hash), /404/);
  } finally {
    globalThis.fetch = orig;
  }
});

// ---------------------------------------------------------------------------
// putDomainDoc (ADR-0027 amendment — chain-anchored publish, bean accord-uecf)
// ---------------------------------------------------------------------------

const SUB = "SuBaccord1111111111111111111111111111111111";

test("putDomainDoc PUTs to /domains/{sha256(bytes)}?subaccord= with text/markdown default", async () => {
  const bytes = enc.encode("# Rules\n");
  const hash = hashDomainDoc(bytes);
  const orig = globalThis.fetch;
  let seen: Request | null = null;
  stubFetch(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = new Request(input, init);
      return new Response(null, { status: 201 });
    }) as typeof fetch,
  );
  try {
    const out = await putDomainDoc("http://daemon.test/", bytes, { subaccord: SUB });
    assert.equal(out.status, 201);
    assert.equal(out.hash, hash);
    assert.equal(
      seen!.url,
      `http://daemon.test/domains/${hash}?subaccord=${SUB}`,
    );
    assert.equal(seen!.method, "PUT");
    assert.equal(seen!.headers.get("content-type"), "text/markdown");
    assert.deepEqual(new Uint8Array(await seen!.arrayBuffer()), bytes);
  } finally {
    globalThis.fetch = orig;
  }
});

test("putDomainDoc: contentType override is passed through", async () => {
  const bytes = enc.encode("binary-ish");
  const orig = globalThis.fetch;
  let ct: string | null = null;
  stubFetch(
    (async (_input: RequestInfo | URL, init?: RequestInit) => {
      ct = new Headers(init!.headers).get("content-type");
      return new Response(null, { status: 201 });
    }) as typeof fetch,
  );
  try {
    await putDomainDoc("http://daemon.test", bytes, {
      subaccord: SUB,
      contentType: "application/octet-stream",
    });
    assert.equal(ct, "application/octet-stream");
  } finally {
    globalThis.fetch = orig;
  }
});

test("putDomainDoc: 200 idempotent no-op resolves ok alongside 201", async () => {
  const bytes = enc.encode("same bytes");
  const hash = hashDomainDoc(bytes);
  const orig = globalThis.fetch;
  stubFetch((async () => new Response(null, { status: 200 })) as typeof fetch);
  try {
    const out = await putDomainDoc("http://daemon.test", bytes, { subaccord: SUB });
    assert.equal(out.status, 200);
    assert.equal(out.hash, hash);
  } finally {
    globalThis.fetch = orig;
  }
});

test("putDomainDoc: 400/404/409/413 throw DomainPublishError with status + body", async () => {
  const bytes = enc.encode("doc");
  const orig = globalThis.fetch;
  for (const status of [400, 404, 409, 413] as const) {
    stubFetch(
      (async () =>
        new Response(JSON.stringify({ error: `boom ${status}` }), {
          status,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    );
    await assert.rejects(
      putDomainDoc("http://daemon.test", bytes, { subaccord: SUB }),
      (e: unknown) => {
        assert.ok(e instanceof DomainPublishError);
        assert.equal(e.status, status);
        assert.ok(e.body.includes(`boom ${status}`));
        return true;
      },
    );
  }
  globalThis.fetch = orig;
});

test("putDomainDoc: non-error body (unparseable) still surfaces in the error", async () => {
  const bytes = enc.encode("doc");
  const orig = globalThis.fetch;
  stubFetch((async () => new Response("gateway junk", { status: 502 })) as typeof fetch);
  try {
    await assert.rejects(
      putDomainDoc("http://daemon.test", bytes, { subaccord: SUB }),
      (e: unknown) => {
        assert.ok(e instanceof DomainPublishError);
        assert.equal(e.status, 502);
        assert.ok(e.body.includes("gateway junk"));
        return true;
      },
    );
  } finally {
    globalThis.fetch = orig;
  }
});
