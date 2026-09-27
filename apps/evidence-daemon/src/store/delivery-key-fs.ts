/**
 * FsDeliveryKeyStore — {@link DeliveryKeyStore} backed by the local filesystem.
 *
 * Object path: `{rootDir}/juror-keys/{juror}.json` (base58 Address string).
 * `put` overwrites (last-writer-wins); `get` reads `null` on ENOENT.
 *
 * Shares the FsStore rootDir (selected via `EVIDENCE_STORAGE=fs`); the
 * `juror-keys/` prefix keeps the namespace clear of evidence objects, so
 * retention sweeps (dispute-scoped) never touch it.
 */

import type { Address } from "@solana/kit";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  deserializeDeliveryKey,
  type DeliveryKeyStore,
  type JurorDeliveryKey,
  serializeDeliveryKey,
} from "./delivery-key.js";

/** True for the "file/dir does not exist" error thrown by `node:fs/promises`. */
function isNotFound(e: unknown): boolean {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT";
}

export interface FsDeliveryKeyStoreConfig {
  /** Same root as {@link ./fs.ts FsStore}; created lazily per-object. */
  readonly rootDir: string;
}

export class FsDeliveryKeyStore implements DeliveryKeyStore {
  private readonly rootDir: string;

  constructor(cfg: FsDeliveryKeyStoreConfig) {
    this.rootDir = cfg.rootDir;
  }

  private pathFor(juror: Address): string {
    return join(this.rootDir, "juror-keys", `${juror}.json`);
  }

  async put(k: JurorDeliveryKey): Promise<void> {
    const path = this.pathFor(k.juror);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, serializeDeliveryKey(k), "utf-8");
  }

  async get(juror: Address): Promise<JurorDeliveryKey | null> {
    try {
      return deserializeDeliveryKey(await readFile(this.pathFor(juror), "utf-8"));
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }
}
