/**
 * S3DeliveryKeyStore — {@link DeliveryKeyStore} backed by S3 / MinIO.
 *
 * Object key: `juror-keys/{juror}`. `put` overwrites (last-writer-wins, the
 * handler gates signature + monotonic `registered_at` first); `get` maps
 * NoSuchKey/NotFound → null. Shares the S3Store client/bucket; the
 * `juror-keys/` prefix keeps the namespace clear of evidence objects, so
 * retention sweeps (dispute-scoped) never touch it.
 */

import {
  GetObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { Address } from "@solana/kit";

import {
  deserializeDeliveryKey,
  type DeliveryKeyStore,
  type JurorDeliveryKey,
  serializeDeliveryKey,
} from "./delivery-key.js";

export interface S3DeliveryKeyStoreConfig {
  readonly client: S3Client;
  readonly bucket: string;
}

export class S3DeliveryKeyStore implements DeliveryKeyStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(cfg: S3DeliveryKeyStoreConfig) {
    this.client = cfg.client;
    this.bucket = cfg.bucket;
  }

  async put(k: JurorDeliveryKey): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `juror-keys/${k.juror}`,
        Body: serializeDeliveryKey(k),
        ContentType: "application/json",
      }),
    );
  }

  async get(juror: Address): Promise<JurorDeliveryKey | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: `juror-keys/${juror}` }),
      );
      if (res.Body === undefined) return null;
      return deserializeDeliveryKey(await res.Body.transformToString("utf-8"));
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      // Some S3-compatible backends (MinIO variants) emit NotFound on GET too.
      if (e instanceof NotFound) return null;
      throw e;
    }
  }
}
