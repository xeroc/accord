/**
 * FsDomainStore — {@link DomainStore} backed by the local filesystem.
 *
 * Object path: `{rootDir}/domains/{hash}.json` — the `domains/` prefix keeps
 * the namespace disjoint from the evidence layout so retention sweeps can
 * never touch it. The file body is a JSON envelope `{v, content_type, bytes}`
 * (bytes base64) so one file carries both; the raw bytes are recoverable
 * byte-exact. sha256(bytes) == hash is enforced at the HTTP layer, not here.
 *
 * Idempotent put: read first; equal bytes ⇒ no-op; differ ⇒ 409
 * ({@link DomainConflictError}); a foreign (non-envelope) file ⇒ 409;
 * absent ⇒ write. No delete — retention is forever (ADR-0027).
 *
 * Shares `rootDir` (and {@link ./fs.ts FsStore}'s config type) with the
 * evidence backend of the same deployment. Race semantics match FsStore: the
 * read-then-write window is accepted; honest re-PUTs are no-ops on equal
 * bytes — a conflicting PUT means a sha256 collision, which never happens.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Domain CAS namespace".
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertDomainHash,
  type DomainObject,
  DomainConflictError,
  type DomainStore,
} from "./domain.js";
import { base64ToBytes, bytesToBase64, hashEquals } from "./store.js";
import type { FsStoreConfig } from "./fs.js";

/** True for the "file/dir does not exist" error thrown by `node:fs/promises`. */
function isNotFound(e: unknown): boolean {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT";
}

/** fs envelope: one file carries both the bytes and the content-type. */
interface DomainFileJson {
  v: 1;
  content_type: string;
  bytes: string;
}

export class FsDomainStore implements DomainStore {
  private readonly rootDir: string;

  constructor(cfg: FsStoreConfig) {
    this.rootDir = cfg.rootDir;
  }

  private pathFor(hash: string): string {
    assertDomainHash(hash);
    return join(this.rootDir, "domains", `${hash}.json`);
  }

  async put(o: DomainObject): Promise<void> {
    const path = this.pathFor(o.hash);

    // Idempotency: read the existing file first.
    //  - same bytes already stored ⇒ no-op (first content-type wins);
    //  - different bytes already stored ⇒ DomainConflictError;
    //  - file present but not one of our envelopes (foreign/tamper) ⇒ conflict;
    //  - absent ⇒ write.
    try {
      const text = await readFile(path, "utf-8");
      try {
        const j = JSON.parse(text) as DomainFileJson;
        if (j.v !== 1) throw new Error(`unsupported DomainObject envelope version: ${j.v}`);
        if (!hashEquals(o.bytes, base64ToBytes(j.bytes))) {
          throw new DomainConflictError(o.hash);
        }
        return; // idempotent no-op — same bytes already stored
      } catch (e) {
        if (e instanceof DomainConflictError) throw e;
        // File present but not deserialisable as one of our envelopes —
        // foreign object (colliding path / tamper). Refuse, matching
        // S3DomainStore's treatment of any differing object at the key.
        throw new DomainConflictError(o.hash);
      }
    } catch (e) {
      if (e instanceof DomainConflictError) throw e;
      if (!isNotFound(e)) throw e;
      // ENOENT — no existing object, proceed to write.
    }

    const envelope: DomainFileJson = {
      v: 1,
      content_type: o.contentType,
      bytes: bytesToBase64(o.bytes),
    };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(envelope), "utf-8");
  }

  async get(hash: string): Promise<DomainObject | null> {
    try {
      const text = await readFile(this.pathFor(hash), "utf-8");
      const j = JSON.parse(text) as DomainFileJson;
      if (j.v !== 1) throw new Error(`unsupported DomainObject envelope version: ${j.v}`);
      return { hash, bytes: base64ToBytes(j.bytes), contentType: j.content_type };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async exists(hash: string): Promise<boolean> {
    try {
      await stat(this.pathFor(hash));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }
}
