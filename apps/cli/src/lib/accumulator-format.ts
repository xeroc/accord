/**
 * accumulator-format.ts — pure ser/des for MST proofs + leaves (ADR-0012).
 *
 * Topic-specific helper for `accumulator:*` commands. Lives in `src/lib/`
 * (not `commands/`) so oclif's command scanner doesn't pick it up. Defines the
 * **proof file schema** that `accumulator:proof` /
 * `accumulator:prepare-stake-proof` emit and `accumulator:verify --path` /
 * `staking --path-from` consume:
 *
 * ```json
 * {
 *   "version": 1,
 *   "index": 3,
 *   "path": [
 *     { "siblingHash": "<64 hex chars>", "siblingSum": "<u64 decimal>" },
 *     ...
 *   ]
 * }
 * ```
 *
 * `siblingHash` = 32-byte lowercase hex (no `0x`). `siblingSum` = u64 as a
 * decimal string (bigint-safe). Leaf `juror` is a base58 address; `stake` is a
 * u64 decimal string or number. Byte-exact: matches {@link MSTNode}/{@link LeafClaim}.
 */
import { readFileSync } from "node:fs";

import {
  type Address,
  getAddressDecoder,
  getAddressEncoder,
  type ReadonlyUint8Array,
} from "@solana/kit";
import type { LeafClaim, MSTNode } from "@useaccord/sdk";

/** Current proof-file schema version. */
export const PROOF_VERSION = 1;

/** Serialized MST node (one path element). */
export interface SerializedNode {
  siblingHash: string; // 64 hex chars
  siblingSum: string; // u64 decimal
}

/** The on-disk proof file — what `staking --path-from` reads. */
export interface ProofFile {
  version: number;
  index: number;
  path: SerializedNode[];
}

/** A serialized leaf for `--leaves` input. */
export interface SerializedLeaf {
  juror: string; // base58 address
  stake: string | number; // u64
}

// --- byte ↔ hex -----------------------------------------------------------

export function bytesToHex(bytes: Uint8Array | ReadonlyUint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`InvalidHex: odd length (${hex.length})`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`InvalidHex: "${hex.slice(i * 2, i * 2 + 2)}"`);
    out[i] = byte;
  }
  return out;
}

// --- base58 (address ↔ bytes) ---------------------------------------------
//
// ponytail: reuse Kit's address codec (base58 + checksum) rather than a
// hand-rolled alphabet — keeps validation identical to the on-chain Address type.

const addressDecoder = getAddressDecoder();
const addressEncoder = getAddressEncoder();

export function bytesToBase58(bytes: Uint8Array | ReadonlyUint8Array): string {
  return addressDecoder.decode(bytes as ReadonlyUint8Array);
}

export function base58ToBytes(addr: string): Uint8Array {
  const decoded = addressEncoder.encode(addr as Address);
  if (decoded.length !== 32) {
    throw new Error(`InvalidJuror: address must decode to 32 bytes, got ${decoded.length}`);
  }
  return new Uint8Array(decoded);
}

// --- path ser/des ---------------------------------------------------------

export function serializePath(path: MSTNode[]): SerializedNode[] {
  return path.map((n) => ({
    siblingHash: bytesToHex(n.siblingHash),
    siblingSum: n.siblingSum.toString(),
  }));
}

export function deserializePath(nodes: SerializedNode[]): MSTNode[] {
  return nodes.map((n) => ({
    siblingHash: hexToBytes(n.siblingHash),
    siblingSum: BigInt(n.siblingSum),
  }));
}

export function proofToFile(index: number, path: MSTNode[]): ProofFile {
  return { version: PROOF_VERSION, index, path: serializePath(path) };
}

export function fileToProof(file: ProofFile): { index: number; path: MSTNode[] } {
  if (file.version !== PROOF_VERSION) {
    throw new Error(`UnsupportedProofVersion: expected ${PROOF_VERSION}, got ${file.version}`);
  }
  return { index: file.index, path: deserializePath(file.path) };
}

// --- leaf ser/des ---------------------------------------------------------

export function serializeLeaf(leaf: LeafClaim): SerializedLeaf {
  return { juror: bytesToBase58(leaf.juror), stake: leaf.stake.toString() };
}

export function deserializeLeaf(leaf: SerializedLeaf): LeafClaim {
  return { juror: base58ToBytes(leaf.juror), stake: BigInt(leaf.stake) };
}

export function deserializeLeaves(leaves: SerializedLeaf[]): LeafClaim[] {
  return leaves.map(deserializeLeaf);
}

// --- file I/O -------------------------------------------------------------

/** Read + JSON-parse a file (throws a clear error if missing/invalid). */
export function readJsonFile<T>(path: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(`Cannot read file "${path}": ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`Invalid JSON in "${path}": ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Parse a flag value that is either inline JSON or a path to a JSON file.
 * Used by `verify --leaf` (a single leaf can be passed inline for quick audits).
 */
export function readJsonArgOrFile<T>(arg: string): T {
  const trimmed = arg.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as T;
    } catch (e) {
      throw new Error(`Invalid JSON argument: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return readJsonFile<T>(arg);
}
