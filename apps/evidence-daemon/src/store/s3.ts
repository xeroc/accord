/**
 * S3Store — v1 {@link EvidenceStore} backed by S3 / MinIO.
 *
 * Object key:     `{subaccord}/{dispute}/{round}` (base58 Address strings + round index).
 * Object body:    serialized {@link EvidenceBundle} — CIPHERTEXT ONLY.
 * Object metadata: `plaintext-hash` (base64), `subaccord`, `ingested-at`.
 * Idempotent put: HEAD first; equal `plaintext-hash` ⇒ no-op; differ ⇒ 409
 *                 ({@link EvidenceConflictError}); absent ⇒ PutObject.
 * SSE:            SSE-S3 (`AES256`, default) or SSE-KMS (`aws:kms`) —
 *                 defense-in-depth; the body is already application ciphertext.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Storage trait (pluggable) — v1: S3/MinIO or local FS".
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Address } from "@solana/kit";
import {
  base64ToBytes,
  bytesToBase64,
  deserializeBundle,
  type EvidenceBundle,
  EvidenceConflictError,
  hashEquals,
  isSafeEntryPath,
  type EvidenceStore,
  type FileStat,
  serializeBundle,
} from "./store.js";

/** Metadata keys (S3 lowercases user-metadata, but we emit lowercase already). */
const META_HASH = "plaintext-hash";
const META_SUBACCORD = "subaccord";
const META_INGESTED_AT = "ingested-at";

export interface S3StoreConfig {
  /** Configured S3/MinIO client (credentials, endpoint, forcePathStyle, region). */
  readonly client: S3Client;
  /** Bucket name. The daemon does not create it; ops provisions the bucket. */
  readonly bucket: string;
  /**
   * Server-side encryption. Omit (default) to send NO SSE header — required for
   * S3-compatible stores that don't implement SSE (R2, MinIO, custom gateways).
   * `"AES256"` = SSE-S3, `"aws:kms"` = SSE-KMS (requires kmsKeyId).
   * Belt-and-suspenders only — the body is already application ciphertext.
   */
  readonly serverSideEncryption?: "AES256" | "aws:kms";
  /** KMS key id when serverSideEncryption is `"aws:kms"`. */
  readonly kmsKeyId?: string;
}

function objectKey(subaccord: Address, dispute: Address, round: number): string {
  return `${subaccord}/${dispute}/${round}`;
}

export class S3Store implements EvidenceStore {
  private readonly client: S3Client;
  private readonly sse?: "AES256" | "aws:kms";
  private readonly bucket: string;
  private readonly kmsKeyId?: string;

  constructor(cfg: S3StoreConfig) {
    this.client = cfg.client;
    this.bucket = cfg.bucket;
    this.sse = cfg.serverSideEncryption;
    this.kmsKeyId = cfg.kmsKeyId;
    if (this.sse === "aws:kms" && !this.kmsKeyId) {
      throw new Error("S3Store: kmsKeyId is required when SSE is aws:kms");
    }
  }

  async put(b: EvidenceBundle): Promise<void> {
    await this.putObject(objectKey(b.subaccord, b.dispute, b.round), b);
  }

  /**
   * HEAD-then-PUT with plaintextHash idempotency (v1 put and v2 putFile):
   *  - same hash already stored ⇒ no-op;
   *  - different hash already stored ⇒ EvidenceConflictError;
   *  - object present without our metadata (foreign) ⇒ conflict;
   *  - absent ⇒ PutObject.
   *
   * S3 HEAD is eventually-consistent for new objects in some deployments, but
   * for the put-after-put pattern here the
   * ponytail: race window between HEAD and PUT is acceptable — honest
   * re-PUTs are no-ops on equal hashes; a conflicting PUT (different hash
   * for one key) does not occur in the protocol (one key ⇒ one plaintext).
   * Last-writer-wins on the metastable race.
   */
  private async putObject(key: string, b: EvidenceBundle, path?: string): Promise<void> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      const existingB64 = head.Metadata?.[META_HASH];
      if (existingB64 === undefined) {
        // Object present without our metadata — not one of ours. Refuse.
        throw new EvidenceConflictError({
          subaccord: b.subaccord,
          dispute: b.dispute,
          round: b.round,
          existingHash: new Uint8Array(),
          ...(path === undefined ? {} : { path }),
        });
      }
      if (!hashEquals(b.plaintextHash, base64ToBytes(existingB64))) {
        throw new EvidenceConflictError({
          subaccord: b.subaccord,
          dispute: b.dispute,
          round: b.round,
          existingHash: base64ToBytes(existingB64),
          ...(path === undefined ? {} : { path }),
        });
      }
      return; // idempotent no-op — same hash already stored
    } catch (e) {
      if (e instanceof EvidenceConflictError) throw e;
      if (!(e instanceof NotFound)) throw e;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: serializeBundle(b),
        ContentType: "application/json",
        Metadata: {
          [META_HASH]: bytesToBase64(b.plaintextHash),
          [META_SUBACCORD]: b.subaccord,
          [META_INGESTED_AT]: String(b.ingestedAt),
        },
        ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
        ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
      }),
    );
  }

  /** v2 multifile key: `{sa}/{d}/{round}.files/{path}`. */
  private fileKey(subaccord: Address, dispute: Address, round: number, path: string): string {
    return `${objectKey(subaccord, dispute, round)}.files/${path}`;
  }

  async putFile(b: EvidenceBundle, path: string): Promise<void> {
    if (!isSafeEntryPath(path)) {
      throw new Error(`unsafe entry path: ${JSON.stringify(path)}`);
    }
    await this.putObject(this.fileKey(b.subaccord, b.dispute, b.round, path), b, path);
  }

  async getFile(
    subaccord: Address,
    dispute: Address,
    round: number,
    path: string,
  ): Promise<EvidenceBundle | null> {
    if (!isSafeEntryPath(path)) return null;
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.fileKey(subaccord, dispute, round, path),
        }),
      );
      if (res.Body === undefined) return null;
      // ponytail: transformToString keeps JSON UTF-8 intact without a
      // streaming parser; size capped by the HTTP layer's per-doc limit.
      const text = await res.Body.transformToString("utf-8");
      return deserializeBundle(text);
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      // Some S3-compatible backends (MinIO variants) emit NotFound on GET too.
      if (e instanceof NotFound) return null;
      throw e;
    }
  }

  async listFiles(subaccord: Address, dispute: Address, round: number): Promise<FileStat[]> {
    const prefix = `${objectKey(subaccord, dispute, round)}.files/`;
    const out: FileStat[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(token === undefined ? {} : { ContinuationToken: token }),
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key !== undefined) {
          out.push({ path: obj.Key.slice(prefix.length), bytes: obj.Size ?? 0 });
        }
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token !== undefined);
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async get(subaccord: Address, dispute: Address, round: number): Promise<EvidenceBundle | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey(subaccord, dispute, round),
        }),
      );
      if (res.Body === undefined) return null;
      // ponytail: Buffer.from(await res.Body.transformToString()) keeps JSON
      // UTF-8 intact without a streaming JSON parser. Evidence-size capped by
      // EVIDENCE_MAX_EVIDENCE_BYTES at the HTTP layer.
      const text = await res.Body.transformToString("utf-8");
      return deserializeBundle(text);
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      // Some S3-compatible backends (MinIO variants) emit NotFound on GET too.
      if (e instanceof NotFound) return null;
      throw e;
    }
  }

  async delete(subaccord: Address, dispute: Address, round: number): Promise<void> {
    // S3 delete is idempotent: deleting a nonexistent key returns 204.
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(subaccord, dispute, round),
      }),
    );
  }

  async exists(subaccord: Address, dispute: Address, round: number): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey(subaccord, dispute, round),
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof NotFound) return false;
      throw e;
    }
  }
}
