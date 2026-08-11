/**
 * FsStore — {@link EvidenceStore} backed by the local filesystem.
 *
 * Object path: `{rootDir}/{subaccord}/{dispute}/{round}.json` (base58 Address
 * strings + round index). One file per `(dispute, round)`.
 * Object body:   serialized {@link EvidenceBundle} — CIPHERTEXT ONLY.
 * Idempotent put: read first; equal `plaintextHash` ⇒ no-op; differ ⇒ 409
 *                 ({@link EvidenceConflictError}); a foreign (non-bundle) file
 *                 ⇒ 409 (existingHash empty); absent ⇒ write.
 *
 * Designed for local development and single-node self-hosting where a managed
 * object store is unnecessary. For HA / multi-replica deployments use
 * {@link ./s3.ts S3Store} (every replica must share one rootDir via a shared
 * volume, or use S3). Select with `EVIDENCE_STORAGE` (default `s3`).
 *
 * Race semantics match S3Store: the read-then-write window is accepted
 * (last-writer-wins on the metastable race); honest re-PUTs are no-ops on
 * equal hashes — a conflicting PUT (different hash for one dispute+round) does
 * not occur in the protocol (one dispute+round ⇒ one plaintext).
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Storage trait (pluggable)".
 */

import type { Address } from "@solana/kit";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  deserializeBundle,
  type EvidenceBundle,
  EvidenceConflictError,
  hashEquals,
  type EvidenceStore,
  serializeBundle,
} from "./store.js";

export interface FsStoreConfig {
  /**
   * Directory holding evidence files. Created lazily (recursive) per-object on
   * first put, so a missing rootDir reads as empty (no evidence) rather than a
   * boot error. The composition root pre-creates it so `/healthz` is green.
   */
  readonly rootDir: string;
}

/** True for the "file/dir does not exist" error thrown by `node:fs/promises`. */
function isNotFound(e: unknown): boolean {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT";
}

export class FsStore implements EvidenceStore {
  private readonly rootDir: string;

  constructor(cfg: FsStoreConfig) {
    this.rootDir = cfg.rootDir;
  }

  private pathFor(subaccord: Address, dispute: Address, round: number): string {
    return join(this.rootDir, subaccord, dispute, `${round}.json`);
  }

  async put(b: EvidenceBundle): Promise<void> {
    const path = this.pathFor(b.subaccord, b.dispute, b.round);

    // Idempotency: read the existing file first.
    //  - same hash already stored ⇒ no-op;
    //  - different hash already stored ⇒ EvidenceConflictError;
    //  - file present but not one of our bundles (foreign/tamper) ⇒ conflict;
    //  - absent ⇒ write.
    try {
      const text = await readFile(path, "utf-8");
      try {
        const existing = deserializeBundle(text);
        if (!hashEquals(b.plaintextHash, existing.plaintextHash)) {
          throw new EvidenceConflictError({
            subaccord: b.subaccord,
            dispute: b.dispute,
            round: b.round,
            existingHash: existing.plaintextHash,
          });
        }
        return; // idempotent no-op — same hash already stored
      } catch (e) {
        if (e instanceof EvidenceConflictError) throw e;
        // File present but not deserialisable as one of our bundles — foreign
        // object (colliding path / tamper). Refuse, matching S3Store's treatment
        // of an object present without our plaintext-hash metadata.
        throw new EvidenceConflictError({
          subaccord: b.subaccord,
          dispute: b.dispute,
          round: b.round,
          existingHash: new Uint8Array(),
        });
      }
    } catch (e) {
      if (e instanceof EvidenceConflictError) throw e;
      if (!isNotFound(e)) throw e;
      // ENOENT — no existing object, proceed to write.
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, serializeBundle(b), "utf-8");
  }

  async get(subaccord: Address, dispute: Address, round: number): Promise<EvidenceBundle | null> {
    try {
      const text = await readFile(this.pathFor(subaccord, dispute, round), "utf-8");
      return deserializeBundle(text);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async delete(subaccord: Address, dispute: Address, round: number): Promise<void> {
    // Idempotent: unlinking a missing path is a no-op (ENOENT swallowed).
    try {
      await unlink(this.pathFor(subaccord, dispute, round));
    } catch (e) {
      if (isNotFound(e)) return;
      throw e;
    }
  }

  async exists(subaccord: Address, dispute: Address, round: number): Promise<boolean> {
    try {
      await stat(this.pathFor(subaccord, dispute, round));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }
}
