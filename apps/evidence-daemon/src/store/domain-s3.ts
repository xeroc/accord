/**
 * S3DomainStore — {@link DomainStore} backed by S3 / MinIO.
 *
 * Object key:     `domains/{hash}` — the `domains/` prefix keeps the
 *                 namespace disjoint from the evidence layout so retention
 *                 sweeps can never touch it.
 * Object body:    the raw public bytes (no envelope).
 * Object metadata: S3's native `ContentType` — stored on PUT, echoed on GET.
 * Idempotent put: GET first; equal bytes ⇒ no-op (first content-type wins);
 *                 differ ⇒ 409 ({@link DomainConflictError}); absent ⇒
 *                 PutObject. sha256(bytes) == hash is enforced at the HTTP
 *                 layer, not here.
 * SSE:            optional, same options as {@link ./s3.ts S3Store}.
 *
 * No delete — retention is forever (ADR-0027). Shares the evidence
 * deployment's client and bucket via the same config type.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Domain CAS namespace".
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertDomainHash,
  DEFAULT_DOMAIN_CONTENT_TYPE,
  type DomainObject,
  DomainConflictError,
  type DomainStore,
} from "./domain.js";
import { hashEquals } from "./store.js";
import type { S3StoreConfig } from "./s3.js";

function objectKey(hash: string): string {
  return `domains/${hash}`;
}

export class S3DomainStore implements DomainStore {
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
      throw new Error("S3DomainStore: kmsKeyId is required when SSE is aws:kms");
    }
  }

  async put(o: DomainObject): Promise<void> {
    assertDomainHash(o.hash);
    const key = objectKey(o.hash);

    // Idempotency: GET the key first and compare BYTES (the key already is
    // the hash, so metadata comparison is useless here). The HEAD-then-PUT
    // race window of S3Store applies unchanged: honest re-PUTs are no-ops on
    // equal bytes — a conflicting PUT means a sha256 collision, which never
    // happens. Last-writer-wins on the metastable race.
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const existing =
        res.Body === undefined ? new Uint8Array() : await res.Body.transformToByteArray();
      if (!hashEquals(o.bytes, existing)) {
        throw new DomainConflictError(o.hash);
      }
      return; // idempotent no-op — same bytes already stored
    } catch (e) {
      if (e instanceof DomainConflictError) throw e;
      if (!(e instanceof NoSuchKey) && !(e instanceof NotFound)) throw e;
      // absent — fall through to PutObject.
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: o.bytes,
        ContentType: o.contentType,
        ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
        ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
      }),
    );
  }

  async get(hash: string): Promise<DomainObject | null> {
    assertDomainHash(hash);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(hash) }),
      );
      if (res.Body === undefined) return null;
      return {
        hash,
        bytes: await res.Body.transformToByteArray(),
        // Objects not written by us may carry no ContentType — default rather
        // than violate the DomainObject contract.
        contentType: res.ContentType ?? DEFAULT_DOMAIN_CONTENT_TYPE,
      };
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      // Some S3-compatible backends (MinIO variants) emit NotFound on GET too.
      if (e instanceof NotFound) return null;
      throw e;
    }
  }

  async exists(hash: string): Promise<boolean> {
    assertDomainHash(hash);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey(hash) }));
      return true;
    } catch (e) {
      if (e instanceof NotFound) return false;
      throw e;
    }
  }
}
