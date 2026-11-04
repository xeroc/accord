/**
 * FsTraceStore — {@link TraceStore} backed by the local filesystem (ADR-0037).
 *
 * Object path: `{rootDir}/traces/{subaccord}/{dispute}/{juror}.jsonl` — one
 * append-only JSONL line per batch (`serializeTraceBatch`). Idempotent append
 * via seq-check: a batch whose seq is ≤ the last stored seq is a no-op (the
 * ingest gate already no-ops seq ≤ last; this guard keeps the file honest
 * under direct replays). No delete — keep forever.
 *
 * `readEvents` reads exactly one court's shard
 * (`{rootDir}/traces/{sub}/{dispute}/` — the subaccord scope separates
 * clusters: dispute PDAs are cluster-agnostic, two clusters can host
 * different disputes at one address). Batches with seq ≥ fromSeq expand to
 * envelopes, ordered by (juror, seq).
 *
 * Shares the FsStore rootDir (selected via `EVIDENCE_STORAGE=fs`); the
 * `traces/` prefix keeps the namespace clear of evidence objects, so
 * retention sweeps (dispute-scoped) never touch it.
 */

import type { Address } from "@solana/kit";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { FsStoreConfig } from "./fs.js";
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

/** True for the "file/dir does not exist" error thrown by `node:fs/promises`. */
function isNotFound(e: unknown): boolean {
  return e instanceof Error && "code" in e && e.code === "ENOENT";
}

export class FsTraceStore implements TraceStore {
  private readonly rootDir: string;

  constructor(cfg: FsStoreConfig) {
    this.rootDir = cfg.rootDir;
  }

  /** Parse a juror's JSONL file; ENOENT ⇒ empty (nothing appended yet). */
  private async readBatches(path: string): Promise<TraceBatch[]> {
    let text: string;
    try {
      text = await readFile(path, "utf-8");
    } catch (e) {
      if (isNotFound(e)) return [];
      throw e;
    }
    return text
      .split("\n")
      .filter((line) => line.length > 0)
      .map(parseTraceBatch);
  }

  async appendBatch(b: TraceBatch): Promise<void> {
    assertTraceAddress("subaccord", b.subaccord);
    assertTraceAddress("dispute", b.dispute);
    assertTraceAddress("juror", b.juror);
    const path = join(this.rootDir, "traces", b.subaccord, b.dispute, `${b.juror}.jsonl`);
    const batches = await this.readBatches(path);
    const last = batches[batches.length - 1];
    if (last !== undefined && last.seq >= b.seq) return; // idempotent no-op — first write wins
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${serializeTraceBatch(b)}\n`, "utf-8");
  }

  async lastSeq(subaccord: Address, dispute: Address, juror: Address): Promise<number | null> {
    assertTraceAddress("subaccord", subaccord);
    assertTraceAddress("dispute", dispute);
    assertTraceAddress("juror", juror);
    const path = join(this.rootDir, "traces", subaccord, dispute, `${juror}.jsonl`);
    const batches = await this.readBatches(path);
    const last = batches[batches.length - 1];
    return last === undefined ? null : last.seq;
  }

  async readEvents(
    subaccord: Address,
    dispute: Address,
    juror?: Address,
    fromSeq = 0,
  ): Promise<TraceEnvelope[]> {
    assertTraceAddress("subaccord", subaccord);
    assertTraceAddress("dispute", dispute);
    if (juror !== undefined) assertTraceAddress("juror", juror);
    // One court's shard only — dispute PDAs are cluster-agnostic and the
    // subaccord is what separates two clusters' cycles at one address.
    const disputeDir = join(this.rootDir, "traces", subaccord, dispute);
    const jurors = juror !== undefined ? [juror] : await this.listJurors(disputeDir);
    const envelopes: TraceEnvelope[] = [];
    for (const j of jurors) {
      for (const b of await this.readBatches(join(disputeDir, `${j}.jsonl`))) {
        if (b.seq < fromSeq) continue;
        for (const event of b.events) envelopes.push(traceEnvelopeOf(b, event));
      }
    }
    sortTraceEnvelopes(envelopes);
    return envelopes;
  }

  /** Juror names (`.jsonl` stems) in a dispute dir; ENOENT ⇒ none. */
  private async listJurors(disputeDir: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(disputeDir);
    } catch (e) {
      if (isNotFound(e)) return [];
      throw e;
    }
    return entries.filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -".jsonl".length));
  }

  /**
   * Public stamp: marker file `{rootDir}/traces-public/{subaccord}/{dispute}`.
   * A rewrite of the constant body is a byte-identical no-op — idempotent by
   * construction.
   */
  async markPublic(subaccord: Address, dispute: Address): Promise<void> {
    assertTraceAddress("subaccord", subaccord);
    assertTraceAddress("dispute", dispute);
    const path = join(this.rootDir, "traces-public", subaccord, dispute);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "1", "utf-8");
  }

  async isPublic(subaccord: Address, dispute: Address): Promise<boolean> {
    assertTraceAddress("subaccord", subaccord);
    assertTraceAddress("dispute", dispute);
    try {
      await readFile(join(this.rootDir, "traces-public", subaccord, dispute), "utf-8");
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }
}
