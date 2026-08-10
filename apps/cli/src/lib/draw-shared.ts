/**
 * draw/shared.ts — topic-local helpers shared by the six `draw:*` commands.
 *
 * NOT an oclif command (named exports only; oclif skips non-Command files).
 * Lives in `src/commands/draw/` so the draw topic is self-contained — the fleet
 * contract forbids touching `src/lib/*`, and this concern is draw-specific.
 *
 * Two concerns:
 *   1. Membership JSON serde — the wire format `resolve-seat`/`resolve-panel`
 *      emit and `seat`/`submit-panel` consume (CLI.md §1.6 pipeline composability).
 *      Bytes → lowercase hex; bigint → decimal string; everything else as-is.
 *   2. Draw-tree loading + seat/panel resolution — fetch the Dispute's frozen
 *      root/total + the Subaccord's depth + all JurorStake leaves, rebuild the
 *      MST, verify it reconstructs the FROZEN root (the snapshot at VRF commit
 *      time), then run {@link resolveSeat} per seat with deterministic
 *      collision re-roll.
 *
 * Sources of truth:
 *   - SDK surface: packages/sdk/src/methods/{vrf,mst}.ts
 *   - e2e reference: tests/src/draw-harness.ts (resolveDistinctPanel)
 *   - single-signer model: the loaded wallet is `caller` for every send.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getAddressDecoder, getAddressEncoder, type Address } from "@solana/kit";
import {
  buildAccumulator,
  fetchMaybeDispute,
  fetchMaybeSubaccord,
  findJurorStakePda,
  findJurorStakesBySubaccord,
  resolveSeat,
  type LeafClaim,
  type MerkleAccumulator,
  type MSTNode,
  type SeatMembership,
} from "@useaccord/sdk";

import type { ChainContext } from "./base-command.js";

// ---------------------------------------------------------------------------
// Byte / hex helpers
// ---------------------------------------------------------------------------

/** Uint8Array → lowercase hex (no `0x`). */
export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** Lowercase hex (with or without `0x`) → Uint8Array. */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error(`InvalidHexLength: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Address → 32 raw bytes (leaf `juror` field). */
export function addressToBytes(addr: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(addr));
}

/** 32 raw bytes → Address. */
export function bytesToAddress(b: Uint8Array): Address {
  return getAddressDecoder().decode(b) as Address;
}

/**
 * Validate a flag-supplied address string and return it as a branded
 * {@link Address} (Kit's `Address` is a nominal base58 string). Throws on a
 * malformed value so the user gets a clear error instead of a deep RPC failure.
 * Trust-boundary validation — do not bypass with a raw `as Address` cast.
 */
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function parseAddress(s: string, field: string): Address {
  if (!ADDRESS_RE.test(s)) {
    throw new Error(`InvalidAddress: ${field} must be a base58 Solana address (got "${s}")`);
  }
  return s as Address;
}

// ---------------------------------------------------------------------------
// Membership JSON serde — CLI.md §1.6 pipeline format
// ---------------------------------------------------------------------------

/** Serialized leaf shape (bytes→hex, bigint→string). */
interface LeafJson {
  juror: string;
  stake: string;
}
/** Serialized proof node shape. */
interface MSTNodeJson {
  siblingHash: string;
  siblingSum: string;
}
/** Serialized {@link SeatMembership} — the pipeline wire format. */
export interface SeatMembershipJson {
  leaf: LeafJson;
  index: number;
  proof: MSTNodeJson[];
  jurorStake: string;
  retries: number;
}

/** Convert a {@link SeatMembership} to a JSON-safe plain object. */
export function membershipToJson(m: SeatMembership): SeatMembershipJson {
  return {
    leaf: { juror: bytesToHex(m.leaf.juror), stake: m.leaf.stake.toString() },
    index: m.index,
    proof: m.proof.map((p) => ({
      siblingHash: bytesToHex(p.siblingHash),
      siblingSum: p.siblingSum.toString(),
    })),
    jurorStake: m.jurorStake,
    retries: m.retries,
  };
}

/** Revive a {@link SeatMembership} from its JSON form (validates structure). */
export function membershipFromJson(obj: unknown): SeatMembership {
  if (typeof obj !== "object" || obj === null) throw badMembership("not an object");
  const o = obj as Record<string, unknown>;
  return {
    leaf: parseLeaf(o.leaf),
    index: parseIndex(o.index),
    proof: parseProof(o.proof),
    jurorStake: parseAddress(String(o.jurorStake ?? ""), "jurorStake"),
    retries: parseRetries(o.retries),
  };
}

function badMembership(reason: string): Error {
  return new Error(`InvalidMembershipJson: ${reason}`);
}

function parseLeaf(v: unknown): LeafClaim {
  if (typeof v !== "object" || v === null) throw badMembership("leaf missing");
  const l = v as Record<string, unknown>;
  if (typeof l.juror !== "string") throw badMembership("leaf.juror must be hex");
  if (typeof l.stake !== "string") throw badMembership("leaf.stake must be string");
  const juror = hexToBytes(l.juror);
  if (juror.length !== 32) throw badMembership(`leaf.juror must be 32 bytes (got ${juror.length})`);
  let stake: bigint;
  try {
    stake = BigInt(l.stake);
  } catch {
    throw badMembership(`leaf.stake not a valid integer: ${l.stake}`);
  }
  if (stake < 0n) throw badMembership("leaf.stake must be non-negative");
  return { juror, stake };
}

function parseIndex(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw badMembership(`index must be a non-negative integer (got ${String(v)})`);
  }
  return v;
}

function parseProof(v: unknown): MSTNode[] {
  if (!Array.isArray(v)) throw badMembership("proof must be an array");
  return v.map((node, i) => {
    if (typeof node !== "object" || node === null) throw badMembership(`proof[${i}] not an object`);
    const n = node as Record<string, unknown>;
    if (typeof n.siblingHash !== "string")
      throw badMembership(`proof[${i}].siblingHash must be hex`);
    if (typeof n.siblingSum !== "string")
      throw badMembership(`proof[${i}].siblingSum must be string`);
    const siblingHash = hexToBytes(n.siblingHash);
    if (siblingHash.length !== 32) {
      throw badMembership(`proof[${i}].siblingHash must be 32 bytes`);
    }
    let siblingSum: bigint;
    try {
      siblingSum = BigInt(n.siblingSum);
    } catch {
      throw badMembership(`proof[${i}].siblingSum not an integer: ${n.siblingSum}`);
    }
    return { siblingHash, siblingSum };
  });
}

function parseRetries(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw badMembership(`retries must be a non-negative integer (got ${String(v)})`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// --out / --membership file + stdin I/O
// ---------------------------------------------------------------------------

/**
 * Read `--membership`/`--in` content. `-` (or omitted with piped stdin) reads
 * stdin as UTF-8; any other value is a file path.
 */
export function readInput(spec: string): string {
  if (spec === "-") return readFileSync(0, "utf8");
  return readFileSync(spec, "utf8");
}

/** Write `content` to `spec` (`-` = stdout, else a file path). */
export function writeOutput(spec: string, content: string): void {
  if (spec === "-") {
    process.stdout.write(content + "\n");
    return;
  }
  writeFileSync(spec, content);
}

// ---------------------------------------------------------------------------
// Draw-tree loading + seat/panel resolution
// ---------------------------------------------------------------------------

/** Everything the seat/panel resolvers need from the chain, pre-loaded. */
export interface DrawTreeContext {
  /** The Dispute PDA (also the sortition domain-separator input). */
  dispute: Address;
  /** `dispute.key()` bytes — fed into the VRF seed hash. */
  disputeBytes: Uint8Array;
  /** The committed VRF (32 bytes); null if the oracle callback hasn't landed. */
  committedVrf: Uint8Array;
  /** Rebuilt accumulator over the frozen JurorStake snapshot. */
  tree: MerkleAccumulator;
  /** juror-bytes-hex → JurorStake PDA address. */
  jurorPdaByHex: Map<string, Address>;
}

/** Fetch + rebuild everything a draw needs from the chain. Read-only. */
export async function loadDrawTree(ctx: ChainContext, dispute: Address): Promise<DrawTreeContext> {
  // 1) Dispute → frozenRoot, frozenTotalStake, committedVrf, subaccord.
  const m = await fetchMaybeDispute(ctx.accord.rpc, dispute);
  if (!m.exists) {
    throw new Error(`DisputeNotFound: ${dispute} (no account or wrong owner)`);
  }
  const d = m.data;
  const vrfOpt = d.committedVrf;
  const committedVrf = vrfOpt && vrfOpt.__option === "Some" ? new Uint8Array(vrfOpt.value) : null;
  if (!committedVrf) {
    throw new Error(
      `VrfNotCommitted: dispute ${dispute} has no committed_vrf — run ` +
        "`draw:request-vrf` (or inject on a Surfnet) before resolving seats.",
    );
  }

  // 2) Subaccord → depth (immutable; bounds the rebuilt tree).
  const sm = await fetchMaybeSubaccord(ctx.accord.rpc, d.subaccord);
  if (!sm.exists) {
    throw new Error(`SubaccordNotFound: ${d.subaccord}`);
  }
  const depth = sm.data.depth;

  // 3) All JurorStake leaves → canonical positions → padded accumulator.
  const stakes = await findJurorStakesBySubaccord(ctx.accord.rpc, d.subaccord);
  const size = 2 ** depth;
  const leaves: LeafClaim[] = new Array(size);
  for (let i = 0; i < size; i++) {
    leaves[i] = { juror: new Uint8Array(32), stake: 0n };
  }
  const jurorPdaByHex = new Map<string, Address>();
  for (const s of stakes) {
    const idx = s.data.treeIndex;
    if (idx < 0 || idx >= size) {
      throw new Error(
        `BadTreeIndex: ${idx} out of range for depth ${depth} on JurorStake ${s.address}`,
      );
    }
    const jurorBytes = addressToBytes(s.data.juror);
    leaves[idx] = { juror: jurorBytes, stake: s.data.staked };
    jurorPdaByHex.set(bytesToHex(jurorBytes), s.address);
  }

  const tree = await buildAccumulator(leaves, depth);

  // 4) Verify the rebuild matches the FROZEN root captured at VRF commit. A
  //    mismatch means JurorStake data drifted after freeze (stale local view,
  //    or the snapshot was never frozen against this tree) — resolving seats
  //    would produce proofs the chain rejects.
  if (!constantTimeEqual(tree.rootHash, new Uint8Array(d.frozenRoot))) {
    throw new Error(
      "FrozenRootMismatch: rebuilt accumulator root does not match the " +
        "dispute's frozen_root. The JurorStake snapshot is stale relative to " +
        "the freeze — re-run with fresh on-chain data.",
    );
  }

  return {
    dispute,
    disputeBytes: addressToBytes(dispute),
    committedVrf,
    tree,
    jurorPdaByHex,
  };
}

/** Resolve a single seat against a freshly-loaded tree (read-only). */
export async function resolveOneSeat(
  tc: DrawTreeContext,
  roundIdx: number,
  seat: number,
  drawAttempt: number,
  alreadyDrawn: Uint8Array[],
): Promise<SeatMembership> {
  const resolved = await resolveSeat(
    tc.committedVrf,
    tc.disputeBytes,
    roundIdx,
    seat,
    tc.tree,
    alreadyDrawn,
    1024,
    drawAttempt,
  );
  const pda = tc.jurorPdaByHex.get(bytesToHex(resolved.leaf.juror));
  if (!pda) {
    throw new Error(
      `NoJurorStakePda: drawn juror ${bytesToHex(resolved.leaf.juror)} has no ` +
        "JurorStake account in this Subaccord (tree/indexer mismatch).",
    );
  }
  return {
    leaf: resolved.leaf,
    index: resolved.index,
    proof: resolved.proof,
    jurorStake: pda,
    retries: resolved.retries,
  };
}

/**
 * Resolve a full panel via deterministic collision re-roll. `panelSize` seats,
 * each excluded from subsequent draws. Returns `SeatMembership[]` in seat order.
 */
export async function resolvePanelSeats(
  tc: DrawTreeContext,
  roundIdx: number,
  panelSize: number,
  drawAttempt: number,
): Promise<SeatMembership[]> {
  const out: SeatMembership[] = [];
  const drawn: Uint8Array[] = [];
  for (let seat = 0; seat < panelSize; seat++) {
    const m = await resolveOneSeat(tc, roundIdx, seat, drawAttempt, drawn);
    out.push(m);
    drawn.push(m.leaf.juror);
  }
  return out;
}

/**
 * Derive the per-juror `JurorStake` PDA for a juror address (used by the seat
 * resolvers when synthesizing a membership without a chain fetch — not needed
 * on the normal loadDrawTree path, but kept for completeness/test fixtures).
 */
export async function jurorStakePdaFor(subaccord: Address, juror: Address): Promise<Address> {
  const [pda] = await findJurorStakePda({ subaccord, juror });
  return pda;
}

/** Constant-time byte equality (doesn't short-circuit on the first byte). */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
