/**
 * stores.ts — file-backed duty + vote persistence for the daemon state dir
 * (bean accord-vruh).
 *
 * One JSON file per store (`duties.json` / `votes.json`), keyed
 * `dispute:roundIdx`, written atomically (tmp + rename) on every save —
 * salts and duty lifecycle must survive a crash between writes. Both record
 * types are already JSON-safe (hex strings / decimal bigints), so records
 * serialize verbatim. ponytail: whole-file rewrite per save; volumes are one
 * record per drawn seat — switch to per-record files if duty volume ever
 * makes this hot.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DutyRecord, DutyStore } from "../duty/types";
import type { VoteRecord, VoteStore } from "../vote/commit";

/** A store record file: `{ "dispute:roundIdx": record }`. */
type RecordFile<T> = Record<string, T>;

async function loadRecords<T>(file: string): Promise<RecordFile<T>> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    // Duck-type `code`: a missing file on first run reads as empty.
    if ((e as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }
    throw e;
  }
  return JSON.parse(raw) as RecordFile<T>;
}

async function saveRecords<T>(file: string, records: RecordFile<T>): Promise<void> {
  await mkdir(join(file, ".."), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(records, null, 2), "utf8");
  await rename(tmp, file);
}

function fileStore<T extends { dispute: string; roundIdx: number }>(
  file: string,
): {
  load(dispute: string, roundIdx: number): Promise<T | undefined>;
  save(record: T): Promise<void>;
} {
  return {
    async load(dispute, roundIdx) {
      return (await loadRecords<T>(file))[`${dispute}:${roundIdx}`];
    },
    async save(record) {
      const records = await loadRecords<T>(file);
      records[`${record.dispute}:${record.roundIdx}`] = record;
      await saveRecords(file, records);
    },
  };
}

/** Duty lifecycle records at `{stateDir}/duties.json`. */
export function fileDutyStore(stateDir: string): DutyStore {
  return fileStore<DutyRecord>(join(stateDir, "duties.json"));
}

/** Vote preimages at `{stateDir}/votes.json` — the reveal path's truth. */
export function fileVoteStore(stateDir: string): VoteStore {
  return fileStore<VoteRecord>(join(stateDir, "votes.json"));
}
