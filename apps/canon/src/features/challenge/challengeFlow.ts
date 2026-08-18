/**
 * challengeFlow.ts — orchestrates the Canon challenge evidence + transaction flow.
 *
 * The challenger authors an evidence manifest (title + description markdown +
 * entries), hashes it → evidence_hash, and builds the `challengeItem`
 * instruction. ORDER MATTERS: the daemon's ingest reads the dispute on-chain
 * and 404s ("dispute not found") when it does not exist yet — so the caller
 * must send the challengeItem transaction (which CPIs create_dispute) BEFORE
 * {@link publishChallengeEvidence}. Mirrors the Accord app's CreateDispute
 * spine: tx first, then publish, with a publish-only retry on POST failure.
 *
 * Canon dispute options are FIXED (`[keep, remove]`) — the challenger does NOT
 * author option labels; the description field IS the claim (milestone §1(c),
 * §6).
 *
 * Authority: SPEC §Instructions #4, ADR-0015 (evidence → SDK), EVIDENCE-FORMAT.md.
 */
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import {
  buildManifest,
  generateSalt,
  publishEvidence,
  sha256,
  type ManifestCtx,
} from "@useaccord/sdk/evidence";
import { findDisputePda, findAccordStatePda } from "@useaccord/sdk";
import {
  ACCORD_PROGRAM_ID,
  challengeItem,
  type CanonItem,
  type CanonList,
  type ChallengeItemAccounts,
  type ChallengeItemExtras,
} from "@useaccord/canon";
import { ataAddress } from "../../shared/tokens";

/** Canon-fixed dispute options — the challenger never authors these. */
const CANON_OPTIONS = ["keep", "remove"];

export interface ChallengeEvidenceInput {
  title: string;
  description: string;
  entries: { path: string; sha256?: Uint8Array }[];
}

export interface ChallengeOnChainContext {
  list: Address;
  item: Address;
  listData: CanonList;
  itemData: CanonItem;
  /** The backing Subaccord's evidence_operator Ed25519 pubkey (32 bytes). */
  operatorPub: Uint8Array;
}

export interface ChallengeConfig {
  evidenceDaemonUrl: string;
}

/**
 * Build the evidence manifest + hash + dispute PDA. Fully offline — no
 * network, no daemon. The bytes returned here are the commitment: the
 * evidence_hash goes on-chain via `challengeItem`, and the SAME manifest must
 * be published afterwards (a rebuild would mint a new salt + filedAt and
 * break the hash).
 *
 * - dispute PDA: `["dispute", list, nonce]` where `nonce =
 *   list.dispute_count` — the filer-nonce, unique across all disputes the
 * list files; NOT the per-item challengeCount.
 * - options: Canon-fixed [keep, remove].
 * - evidence_hash = sha256(manifest).
 */
export async function buildChallengeEvidence(
  input: ChallengeEvidenceInput,
  ctx: ChallengeOnChainContext,
): Promise<{ evidenceHash: Uint8Array; manifest: Uint8Array; dispute: Address }> {
  const nonce = ctx.listData.disputeCount;

  // Derive the dispute PDA before building the manifest (it's in the YAML ctx).
  const [disputeAddress] = await findDisputePda({
    filer: ctx.list,
    nonce,
  });

  // The backing subaccord is stored on-chain in CanonList.
  const subaccord = ctx.listData.subaccord;

  const salt = generateSalt();
  const manifestCtx: ManifestCtx = {
    dispute: disputeAddress,
    subaccord,
    filer: ctx.list,
    filedAt: new Date().toISOString(),
  };

  const manifest = buildManifest(
    {
      salt,
      title: input.title.trim(),
      description: input.description.trim() || undefined,
      labels: CANON_OPTIONS,
      entries: input.entries,
    },
    manifestCtx,
  );

  const evidenceHash = await sha256(manifest);
  return { evidenceHash, manifest, dispute: disputeAddress };
}

/**
 * POST the encrypted manifest to the evidence daemon. Fetch-only — never
 * touches the chain — so retrying with the SAME manifest after a POST failure
 * is safe (and idempotent server-side). MUST be called only after the
 * `challengeItem` transaction landed: the daemon reads the dispute on-chain
 * and rejects evidence for a non-existent dispute with 404.
 */
export async function publishChallengeEvidence(
  manifest: Uint8Array,
  dispute: Address,
  ctx: ChallengeOnChainContext,
  config: ChallengeConfig,
): Promise<void> {
  await publishEvidence({
    endpoint: config.evidenceDaemonUrl,
    subaccord: ctx.listData.subaccord,
    dispute,
    manifest,
    operatorPub: ctx.operatorPub,
  });
}

/**
 * Build the full `challengeItem` instruction with all accounts derived.
 * Callers provide the connected wallet as `challenger`.
 */
export async function buildChallengeInstruction(
  ctx: ChallengeOnChainContext,
  challenger: TransactionSigner,
  evidenceHash: Uint8Array,
): Promise<Instruction> {
  const nonce = ctx.listData.disputeCount;
  const feeMint = ctx.listData.feeMint;
  const subaccord = ctx.listData.subaccord;

  const [disputeAddress] = await findDisputePda({
    filer: ctx.list,
    nonce,
  });
  const [accordState] = await findAccordStatePda();

  // Derive ATAs (Kit-native, no web3.js v1).
  const challengerTokenAccount = await ataAddress(challenger.address, feeMint);
  const vault = await ataAddress(ctx.list, feeMint);
  const accordFeeVault = await ataAddress(subaccord, feeMint);

  const accounts: ChallengeItemAccounts = {
    challenger,
    list: ctx.list,
    item: ctx.item,
    subaccord,
    feeMint,
    challengerTokenAccount,
    vault,
  };

  const extras: ChallengeItemExtras = {
    accordDispute: disputeAddress,
    accordState,
    accordFeeVault,
    accordProgram: ACCORD_PROGRAM_ID,
  };

  return challengeItem(accounts, { evidence: evidenceHash }, extras);
}
