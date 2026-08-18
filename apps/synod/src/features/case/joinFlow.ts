/**
 * joinFlow.ts — orchestrates the Synod join evidence + transaction flow
 * (accord-o6nn; canon's challengeFlow pattern adapted to synod keying).
 *
 * The joining party authors an evidence manifest (title + description
 * markdown + entries), the app hashes it → the join evidence hash, encrypts +
 * publishes the bundle to the daemon's pre-dispute grouping route
 * (`POST /evidence/synod/:case/:slot`), then builds the `join` instruction
 * (stake `S` moves party ATA → vault, hash frozen into
 * `SynodCase.evidence[slot]`).
 *
 * Synod keying: the manifest's `dispute` field IS the case PDA (the grouping
 * key the daemon uses pre-file) and `filer` is the joining party. Option
 * labels mirror the on-chain dispute options: party i at i, neutral last.
 *
 * Authority: SPEC §Instructions #2, ADR-0015 (evidence → SDK), ADR-0017.
 */
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { findCaseVaultPda, join } from "@useaccord/synod";

import { ataAddress } from "@/shared/tokens";
import { shortenAddress } from "@/shared/format";
import {
  buildManifest,
  generateSalt,
  publishSynodEvidence,
  sha256,
} from "@useaccord/sdk/evidence";

/** The neutral option label — sits at index `party_count` (SPEC §Inv 4). */
export const NEUTRAL_LABEL = "No party prevails";

/** Roster-order option labels: party i at i (shortened), neutral last. */
export function synodOptionLabels(
  roster: readonly string[],
  partyCount: number,
): string[] {
  return roster
    .slice(0, partyCount)
    .map((p) => (p.length > 9 ? shortenAddress(p, 4) : p))
    .concat(NEUTRAL_LABEL);
}

export interface JoinEvidenceInput {
  title: string;
  description: string;
  /** Entry paths (URLs or references); blank entries are dropped. */
  entries: string[];
}

/** Editor validation — empty array means ready to submit. */
export function joinEvidenceErrors(input: JoinEvidenceInput): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push("Title is required.");
  if (input.entries.every((e) => !e.trim())) {
    errors.push("At least one evidence entry is required.");
  }
  return errors;
}

/** Chain context the manifest + join instruction are built from. */
export interface JoinOnChainContext {
  casePda: Address;
  /** The hosting Subaccord (fee_token for the stake transfer). */
  subaccord: Address;
  /** Evidence operator's raw Ed25519 public key (32 bytes). */
  operatorPub: Uint8Array;
}

/** Everything `buildJoinManifest` needs — testable without RPC. */
export interface JoinManifestCtx extends JoinOnChainContext {
  /** The joining party (manifest `filer`). */
  filer: Address;
  filedAt: string;
  roster: readonly string[];
  partyCount: number;
}

/** Serialize the party's evidence manifest (deterministic for a fixed salt). */
export function buildJoinManifest(
  input: JoinEvidenceInput,
  ctx: JoinManifestCtx,
  salt: Uint8Array = generateSalt(),
): Uint8Array {
  return buildManifest(
    {
      salt,
      title: input.title.trim(),
      description: input.description.trim() || undefined,
      labels: synodOptionLabels(ctx.roster, ctx.partyCount),
      entries: input.entries
        .map((e) => e.trim())
        .filter((e) => e.length > 0)
        .map((path) => ({ path })),
    },
    {
      dispute: ctx.casePda,
      subaccord: ctx.subaccord,
      filer: ctx.filer,
      filedAt: ctx.filedAt,
    },
  );
}

export interface JoinConfig {
  evidenceDaemonUrl: string;
}

/**
 * Build the manifest, hash it (the on-chain join commitment), and publish the
 * encrypted bundle to the daemon at the party's roster slot. Returns the
 * evidence hash for `join`.
 */
export async function prepareJoinEvidence(
  input: JoinEvidenceInput,
  ctx: JoinManifestCtx,
  slot: number,
  config: JoinConfig,
): Promise<{ evidenceHash: Uint8Array; manifest: Uint8Array }> {
  const manifest = buildJoinManifest(input, ctx);
  const evidenceHash = await sha256(manifest);
  await publishSynodEvidence({
    endpoint: config.evidenceDaemonUrl,
    casePda: ctx.casePda,
    slot,
    manifest,
    operatorPub: ctx.operatorPub,
  });
  return { evidenceHash, manifest };
}

/**
 * Build the `join` instruction with all accounts derived: party ATA (stake
 * source), case-PDA-owned vault (stake sink, lazily created).
 */
export async function buildJoinInstruction(
  ctx: JoinOnChainContext & { feeMint: Address },
  party: TransactionSigner,
  evidenceHash: Uint8Array,
): Promise<Instruction> {
  const vault = await findCaseVaultPda(ctx.feeMint, ctx.casePda);
  return join(
    {
      party,
      case: ctx.casePda,
      subaccord: ctx.subaccord,
      feeMint: ctx.feeMint,
      partyTokenAccount: await ataAddress(party.address, ctx.feeMint),
      vault,
    },
    { evidenceHash },
  );
}
