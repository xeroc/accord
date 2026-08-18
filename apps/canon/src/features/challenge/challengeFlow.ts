/**
 * challengeFlow.ts — orchestrates the Canon challenge evidence + transaction flow.
 *
 * The challenger authors an evidence manifest (title + description markdown +
 * entries), hashes it → evidence_hash, publishes the encrypted bundle to the
 * evidence daemon, and builds the `challengeItem` instruction.
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
 * Build the evidence manifest, hash it, publish to the daemon, and return the
 * evidence_hash + manifest bytes.
 *
 * Step 1: derive the dispute PDA (`["dispute", list, nonce]` where
 *         `nonce = list.dispute_count` — the filer-nonce, unique across all
 *         disputes the list files; NOT the per-item challengeCount).
 * Step 2: build the manifest with Canon-fixed options [keep, remove].
 * Step 3: hash the manifest → evidence_hash (the on-chain commitment).
 * Step 4: publish the encrypted manifest to the evidence daemon.
 *
 * Returns the evidence_hash (32 bytes) for the caller to pass to
 * `challengeItem(accounts, { evidence: evidenceHash }, extras)`.
 */
export async function prepareChallengeEvidence(
  input: ChallengeEvidenceInput,
  ctx: ChallengeOnChainContext,
  config: ChallengeConfig,
): Promise<{ evidenceHash: Uint8Array; manifest: Uint8Array }> {
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

  // Publish the encrypted manifest to the evidence daemon.
  await publishEvidence({
    endpoint: config.evidenceDaemonUrl,
    subaccord,
    dispute: disputeAddress,
    manifest,
    operatorPub: ctx.operatorPub,
  });

  return { evidenceHash, manifest };
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
