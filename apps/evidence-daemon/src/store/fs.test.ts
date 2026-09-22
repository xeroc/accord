// fs.test.ts — FsStore behaviour tests.
//
// Exercises the filesystem EvidenceStore backend against a real temp dir
// (Bun test). Mirrors the s3.test.ts behavioural cases so the two backends
// are provably equivalent: put/get round-trip, per-round isolation,
// idempotency on plaintextHash, 409-conflict on a different hash, a foreign
// (non-bundle) file ⇒ conflict, the never-plaintext invariant, and
// exists/delete. The directory-layout block covers the nested-mkdir behaviour
// unique to the filesystem backend.
//
// Run: `pnpm --filter @useaccord/evidence-daemon test` (→ bun test).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FsStore } from "./fs.js";
import {
  base64ToBytes,
  EvidenceConflictError,
  type EvidenceBundle,
  isSafeEntryPath,
  serializeBundle,
} from "./store.js";

// Two distinct, valid 32-byte Solana addresses (system program + token
// program) — address() brands + validates base58/length.
const SUBACCORD = address("11111111111111111111111111111111");
const DISPUTE = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "evidence-fs-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

/** Build a bundle with deterministic ciphertext-ish fields; `over` overrides. */
function mkBundle(over: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    subaccord: SUBACCORD,
    dispute: DISPUTE,
    round: 0,
    ct: new Uint8Array([1, 2, 3, 4, 5]),
    claimantEphemPub: new Uint8Array(32).fill(9),
    wrapped: new Uint8Array(32).fill(7),
    plaintextHash: new Uint8Array(32).fill(0xab),
    ingestedAt: 1_700_000_000_000,
    ...over,
  };
}

/** Wire an FsStore over the per-test temp dir. */
function setup(): FsStore {
  return new FsStore({ rootDir });
}

describe("FsStore — put/get round-trip", () => {
  test("put then get returns an equal bundle", async () => {
    const store = setup();
    const b = mkBundle();
    await store.put(b);
    const got = await store.get(SUBACCORD, DISPUTE, 0);
    expect(got).not.toBeNull();
    expect(got!.subaccord).toBe(SUBACCORD);
    expect(got!.dispute).toBe(DISPUTE);
    expect(got!.round).toBe(0);
    expect(Array.from(got!.ct)).toEqual(Array.from(b.ct));
    expect(Array.from(got!.claimantEphemPub)).toEqual(Array.from(b.claimantEphemPub));
    expect(Array.from(got!.wrapped)).toEqual(Array.from(b.wrapped));
    expect(Array.from(got!.plaintextHash)).toEqual(Array.from(b.plaintextHash));
    expect(got!.ingestedAt).toBe(b.ingestedAt);
  });

  test("get on a missing key returns null", async () => {
    const store = setup();
    const got = await store.get(SUBACCORD, DISPUTE, 0);
    expect(got).toBeNull();
  });

  test("get on a different (missing) dispute returns null", async () => {
    const store = setup();
    await store.put(mkBundle());
    const other = address("Stake11111111111111111111111111111111111111");
    const got = await store.get(SUBACCORD, other, 0);
    expect(got).toBeNull();
  });

  test("per-round isolation — round 0 and round 1 are distinct files", async () => {
    const store = setup();
    const b0 = mkBundle({ round: 0, plaintextHash: new Uint8Array(32).fill(0x01) });
    const b1 = mkBundle({ round: 1, plaintextHash: new Uint8Array(32).fill(0x02) });
    await store.put(b0);
    await store.put(b1);
    const got0 = await store.get(SUBACCORD, DISPUTE, 0);
    const got1 = await store.get(SUBACCORD, DISPUTE, 1);
    expect(Array.from(got0!.plaintextHash)).toEqual(Array.from(b0.plaintextHash));
    expect(Array.from(got1!.plaintextHash)).toEqual(Array.from(b1.plaintextHash));
  });
});

describe("FsStore — idempotency on plaintextHash", () => {
  test("re-PUT of the SAME hash is a no-op (no error, file untouched)", async () => {
    const store = setup();
    const b = mkBundle({ ingestedAt: 1_700_000_000_000 });
    await store.put(b);
    const path = join(rootDir, SUBACCORD, DISPUTE, "0.json");
    const before = await readFile(path, "utf-8");
    // Second PUT with the same hash but a different ingestedAt — must NOT overwrite.
    await store.put(mkBundle({ ingestedAt: 9_999_999_999_999 }));
    const after = await readFile(path, "utf-8");
    expect(after).toBe(before); // byte-identical, not rewritten
    // The original ingestedAt is what survives (proves the no-op path).
    const parsed = JSON.parse(after) as Record<string, unknown>;
    expect(parsed["ingested_at"]).toBe(1_700_000_000_000);
  });

  test("re-PUT of a DIFFERENT hash throws EvidenceConflictError", async () => {
    const store = setup();
    await store.put(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x01) }));
    await expect(
      store.put(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x02) })),
    ).rejects.toBeInstanceOf(EvidenceConflictError);
  });

  test("conflict error carries the existing hash and coordinates", async () => {
    const store = setup();
    const existing = new Uint8Array(32).fill(0x11);
    await store.put(mkBundle({ plaintextHash: existing }));
    let caught: EvidenceConflictError | undefined;
    try {
      await store.put(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x22) }));
    } catch (e) {
      if (e instanceof EvidenceConflictError) caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught!.subaccord).toBe(SUBACCORD);
    expect(caught!.dispute).toBe(DISPUTE);
    expect(caught!.round).toBe(0);
    expect(Array.from(caught!.existingHash)).toEqual(Array.from(existing));
  });

  test("a foreign (non-bundle) file at the key is treated as a conflict", async () => {
    const store = setup();
    // Foreign file (not written by us) — simulates a colliding path / tamper.
    const path = join(rootDir, SUBACCORD, DISPUTE, "0.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '{"v":1,"not":"our-format"}', "utf-8");
    await expect(store.put(mkBundle())).rejects.toBeInstanceOf(EvidenceConflictError);
  });

  test("rounds are independent — a round-1 conflict does not touch round 0", async () => {
    const store = setup();
    const h0 = new Uint8Array(32).fill(0x01);
    const h1 = new Uint8Array(32).fill(0x02);
    await store.put(mkBundle({ round: 0, plaintextHash: h0 }));
    await store.put(mkBundle({ round: 1, plaintextHash: h1 }));
    // Different hash at round 1 → conflict at round 1 only.
    await expect(
      store.put(mkBundle({ round: 1, plaintextHash: new Uint8Array(32).fill(0x03) })),
    ).rejects.toBeInstanceOf(EvidenceConflictError);
    // Round 0 object is untouched.
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(true);
  });
});

describe("FsStore — never-plaintext invariant", () => {
  test("the persisted file body is the ciphertext bundle, never the plaintext", async () => {
    const store = setup();
    // The conceptual plaintext the claimant encrypted. It must NEVER be persisted.
    const PLAINTEXT_SENTINEL = "PLAINTEXT_MUST_NEVER_BE_PERSISTED_xyz";
    const plaintextBytes = new TextEncoder().encode(PLAINTEXT_SENTINEL);

    // Build a bundle whose `ct` is the only place plaintext *could* leak from.
    // ct here is an unrelated ciphertext; the real plaintext is not a field.
    const b: EvidenceBundle = {
      subaccord: SUBACCORD,
      dispute: DISPUTE,
      round: 0,
      ct: new Uint8Array([0xde, 0xad, 0xbe, 0xef]), // ciphertext, not plaintext
      claimantEphemPub: new Uint8Array(32).fill(1),
      wrapped: new Uint8Array(32).fill(2),
      plaintextHash: new Uint8Array(32).fill(0xcd),
      ingestedAt: 1_700_000_000_000,
    };
    void plaintextBytes;
    await store.put(b);

    const path = join(rootDir, SUBACCORD, DISPUTE, "0.json");
    const stored = await readFile(path, "utf-8");

    // 1. Body is byte-identical to serializeBundle — the store writes only this.
    expect(stored).toBe(serializeBundle(b));

    // 2. The plaintext sentinel appears nowhere in the persisted file.
    expect(stored).not.toContain(PLAINTEXT_SENTINEL);

    // 3. The JSON object has exactly the ciphertext schema — no `plaintext` key.
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "claimant_ephem_pub",
        "ct",
        "dispute",
        "ingested_at",
        "plaintext_hash",
        "round",
        "subaccord",
        "v",
        "wrapped",
      ].sort(),
    );
    expect(parsed).not.toHaveProperty("plaintext");

    // 4. The stored `ct` round-trips to the exact ciphertext bytes (not plaintext).
    const ctField = base64ToBytes(parsed["ct"] as string);
    expect(Array.from(ctField)).toEqual(Array.from(b.ct));
  });
});

describe("FsStore — exists / delete", () => {
  test("exists is false before put and true after", async () => {
    const store = setup();
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(false);
    await store.put(mkBundle());
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(true);
  });

  test("exists is false for a missing key", async () => {
    const store = setup();
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(false);
  });

  test("delete is idempotent: deleting a missing key is a no-op", async () => {
    const store = setup();
    await expect(store.delete(SUBACCORD, DISPUTE, 0)).resolves.toBeUndefined();
    // delete after put, then get returns null and exists false.
    await store.put(mkBundle());
    await store.delete(SUBACCORD, DISPUTE, 0);
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(false);
    expect(await store.get(SUBACCORD, DISPUTE, 0)).toBeNull();
    // delete again — still no error.
    await expect(store.delete(SUBACCORD, DISPUTE, 0)).resolves.toBeUndefined();
  });

  test("delete round 1 leaves round 0 intact", async () => {
    const store = setup();
    await store.put(mkBundle({ round: 0 }));
    await store.put(mkBundle({ round: 1, plaintextHash: new Uint8Array(32).fill(0x99) }));
    await store.delete(SUBACCORD, DISPUTE, 1);
    expect(await store.exists(SUBACCORD, DISPUTE, 1)).toBe(false);
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(true);
  });
});

describe("FsStore — directory layout", () => {
  test("creates nested directories on first put (root may not exist yet)", async () => {
    // A rootDir that does not yet exist — the store must create the full chain.
    const freshRoot = join(rootDir, "does-not-exist-yet");
    const store = new FsStore({ rootDir: freshRoot });
    await store.put(mkBundle());
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(true);
    const got = await store.get(SUBACCORD, DISPUTE, 0);
    expect(got).not.toBeNull();
  });

  test("get on a rootDir that does not exist returns null (reads as empty)", async () => {
    const freshRoot = join(rootDir, "no-such-root");
    const store = new FsStore({ rootDir: freshRoot });
    expect(await store.get(SUBACCORD, DISPUTE, 0)).toBeNull();
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(false);
  });
});

describe("FsStore — v2 per-file objects (EVIDENCE-FORMAT §7.1)", () => {
  test("putFile then getFile round-trips under the entry path", async () => {
    const store = setup();
    const b = mkBundle();
    await store.putFile(b, "01-ticket.pdf");
    const got = await store.getFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf");
    expect(got).not.toBeNull();
    expect(Array.from(got!.plaintextHash)).toEqual(Array.from(b.plaintextHash));
    expect(Array.from(got!.ct)).toEqual(Array.from(b.ct));
  });

  test("getFile on a missing path returns null", async () => {
    const store = setup();
    expect(await store.getFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf")).toBeNull();
  });

  test("per-path isolation — two paths in one round are distinct objects", async () => {
    const store = setup();
    const a = mkBundle({ plaintextHash: new Uint8Array(32).fill(0x01) });
    const c = mkBundle({ plaintextHash: new Uint8Array(32).fill(0x02) });
    await store.putFile(a, "01-ticket.pdf");
    await store.putFile(c, "02-id-document.jpg");
    const ga = await store.getFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf");
    const gc = await store.getFile(SUBACCORD, DISPUTE, 0, "02-id-document.jpg");
    expect(Array.from(ga!.plaintextHash)).toEqual(Array.from(a.plaintextHash));
    expect(Array.from(gc!.plaintextHash)).toEqual(Array.from(c.plaintextHash));
  });

  test("nested entry path round-trips; listFiles reports the relative POSIX path", async () => {
    const store = setup();
    await store.putFile(mkBundle(), "docs/report.pdf");
    const got = await store.getFile(SUBACCORD, DISPUTE, 0, "docs/report.pdf");
    expect(got).not.toBeNull();
    expect((await store.listFiles(SUBACCORD, DISPUTE, 0)).map((x) => x.path)).toEqual([
      "docs/report.pdf",
    ]);
    expect((await store.listFiles(SUBACCORD, DISPUTE, 0))[0]!.bytes).toBeGreaterThan(0);
  });

  test("putFile idempotent on the SAME hash (no-op)", async () => {
    const store = setup();
    await store.putFile(mkBundle(), "01-ticket.pdf");
    await store.putFile(mkBundle({ ingestedAt: 2 }), "01-ticket.pdf");
    const got = await store.getFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf");
    expect(got!.ingestedAt).toBe(1_700_000_000_000); // first write untouched
  });

  test("putFile with a DIFFERENT hash at the same path raises EvidenceConflictError", async () => {
    const store = setup();
    await store.putFile(mkBundle(), "01-ticket.pdf");
    expect(
      store.putFile(mkBundle({ plaintextHash: new Uint8Array(32).fill(0xcd) }), "01-ticket.pdf"),
    ).rejects.toBeInstanceOf(EvidenceConflictError);
  });

  test("manifest object and file objects coexist (round.json vs round.files/)", async () => {
    const store = setup();
    await store.put(mkBundle());
    await store.putFile(
      mkBundle({ plaintextHash: new Uint8Array(32).fill(0x02) }),
      "01-ticket.pdf",
    );
    expect(await store.exists(SUBACCORD, DISPUTE, 0)).toBe(true);
    expect(await store.getFile(SUBACCORD, DISPUTE, 0, "01-ticket.pdf")).not.toBeNull();
  });

  test("listFiles on an empty round returns []", async () => {
    const store = setup();
    expect(await store.listFiles(SUBACCORD, DISPUTE, 0)).toEqual([]);
  });

  test("listFiles returns sorted POSIX-relative paths", async () => {
    const store = setup();
    await store.putFile(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x02) }), "02-id.jpg");
    await store.putFile(
      mkBundle({ plaintextHash: new Uint8Array(32).fill(0x03) }),
      "01-ticket.pdf",
    );
    await store.putFile(mkBundle({ plaintextHash: new Uint8Array(32).fill(0x04) }), "a/nested.pdf");
    expect((await store.listFiles(SUBACCORD, DISPUTE, 0)).map((x) => x.path)).toEqual([
      "01-ticket.pdf",
      "02-id.jpg",
      "a/nested.pdf",
    ]);
  });

  test("putFile rejects unsafe paths and writes nothing", async () => {
    const store = setup();
    const unsafe = ["../escape.pdf", "/abs.pdf", "a\\b.pdf", "a//b.pdf", "..", "a/../b.pdf", ""];
    for (const p of unsafe) {
      expect(store.putFile(mkBundle(), p)).rejects.toThrow(/unsafe entry path/i);
    }
    expect(await store.listFiles(SUBACCORD, DISPUTE, 0)).toEqual([]);
  });

  test("isSafeEntryPath — accepts relative POSIX (flat + nested), rejects traversal/absolute/backslash", () => {
    expect(isSafeEntryPath("01-ticket.pdf")).toBe(true);
    expect(isSafeEntryPath("docs/report.pdf")).toBe(true);
    expect(isSafeEntryPath("a/b/c.bin")).toBe(true);
    for (const bad of ["../x", "/x", "a\\b", "a//b", "..", ".", "a/..", "", "a/"]) {
      expect(isSafeEntryPath(bad)).toBe(false);
    }
  });
});
