/**
 * S3TraceStore — {@link TraceStore} backed by S3 / MinIO (ADR-0037).
 *
 * Object key: `traces/{subaccord}/{dispute}/{juror}/{seq}.json` — ONE
 * immutable object per batch, never read-modify-write. Idempotent append:
 * HeadObject first; the seq key already exists ⇒ no-op (first write wins —
 * same-seq re-pushes are byte-identical after sig verification anyway),
 * absent ⇒ PutObject (atomic put).
 *
 * `readEvents` = prefix list + sort: paginated ListObjectsV2 over `traces/`,
 * keep keys shaped `traces/{sub}/{dispute}/{juror}/{seq}.json` for the
 * dispute (and juror, when given), GET + parse
 * each, filter seq ≥ fromSeq, order by (juror, seq). The read API is
 * dispute-keyed while the key space is subaccord-sharded, so the whole
 * `traces/` prefix is listed. No delete — keep forever.
 *
 * Shares the S3Store client/bucket (selected via `EVIDENCE_STORAGE=s3`); the
 * `traces/` prefix keeps the namespace clear of evidence objects, so
 * retention sweeps (dispute-scoped) never touch it.
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { Address } from "@solana/kit";

import type { S3StoreConfig } from "./s3.js";
import {
  assertTraceAddress,
  type TraceBatch,
  type TraceEnvelope,
  type TraceStore,
  parseTraceBatch,
  serializeTraceBatch,
  sortTraceEnvelopes,
  traceEnvelopeOf,
} from "./trace.js";

export class S3TraceStore implements TraceStore {
  private readonly client: S3StoreConfig["client"];
  private readonly bucket: string;
  private readonly sse?: "AES256" | "aws:kms";
  private readonly kmsKeyId?: string;

  constructor(cfg: S3StoreConfig) {
    this.client = cfg.client;
    this.bucket = cfg.bucket;
    this.sse = cfg.serverSideEncryption;
    this.kmsKeyId = cfg.kmsKeyId;
    if (this.sse === "aws:kms" && !this.kmsKeyId) {
      throw new Error("S3TraceStore: kmsKeyId is required when SSE is aws:kms");
    }
  }

  async appendBatch(b: TraceBatch): Promise<void> {
    assertTraceAddress("subaccord", b.subaccord);
    assertTraceAddress("dispute", b.dispute);
    assertTraceAddress("juror", b.juror);
    const key = `traces/${b.subaccord}/${b.dispute}/${b.juror}/${b.seq}.json`;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return; // same-seq re-append is a no-op — the object is immutable per seq
    } catch (e) {
      // Some S3-compatible backends (MinIO variants) emit NoSuchKey on HEAD too.
      if (!(e instanceof NotFound) && !(e instanceof NoSuchKey)) throw e;
      // absent — fall through to PutObject.
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: serializeTraceBatch(b),
        ContentType: "application/json",
        ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
        ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
      }),
    );
  }

  async lastSeq(subaccord: Address, dispute: Address, juror: Address): Promise<number | null> {
    assertTraceAddress("subaccord", subaccord);
    assertTraceAddress("dispute", dispute);
    assertTraceAddress("juror", juror);
    let max: number | null = null;
    for (const key of await this.listKeys(`traces/${subaccord}/${dispute}/${juror}/`)) {
      const seq = Number(key.split("/")[4]!.replace(/\.json$/, ""));
      if (max === null || seq > max) max = seq;
    }
    return max;
  }

  async readEvents(dispute: Address, juror?: Address, fromSeq = 0): Promise<TraceEnvelope[]> {
    assertTraceAddress("dispute", dispute);
    if (juror !== undefined) assertTraceAddress("juror", juror);
    const envelopes: TraceEnvelope[] = [];
    for (const key of await this.listKeys("traces/")) {
      // traces/{subaccord}/{dispute}/{juror}/{seq}.json — direct segment match
      const parts = key.split("/");
      if (parts.length !== 5 || parts[0] !== "traces" || parts[2] !== dispute) continue;
      if (juror !== undefined && parts[3] !== juror) continue;
      if (!/^\d+\.json$/.test(parts[4]!)) continue;
      const b = await this.getBatch(key);
      if (b.seq < fromSeq) continue;
      for (const event of b.events) envelopes.push(traceEnvelopeOf(b, event));
    }
    sortTraceEnvelopes(envelopes);
    return envelopes;
  }

  private async getBatch(key: string): Promise<TraceBatch> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (res.Body === undefined) throw new Error(`S3TraceStore: empty object at ${key}`);
    return parseTraceBatch(await res.Body.transformToString("utf-8"));
  }

  /** All object keys under `prefix` — ListObjectsV2 pagination loop. */
  private async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(token !== undefined ? { ContinuationToken: token } : {}),
        }),
      );
      for (const o of res.Contents ?? []) {
        if (o.Key !== undefined) keys.push(o.Key);
      }
      token =
        res.IsTruncated === true && typeof res.NextContinuationToken === "string"
          ? res.NextContinuationToken
          : undefined;
    } while (token !== undefined);
    return keys;
  }
}
