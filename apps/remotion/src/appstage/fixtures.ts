import type { Account, Address } from "@solana/kit";
import {
  Aggregation,
  type Dispute,
  DisputeState,
  NO_RULING,
} from "@useaccord/sdk";

/** System program address — stand-in for unrelated accounts. */
export const ZERO_ADDRESS = "11111111111111111111111111111111";

export interface DisputeFixture {
  address: string;
  filer?: string;
  subaccord?: string;
  state?: DisputeState;
  currentRound?: number;
  /** u64 on the wire; defaults to the NO_RULING sentinel. */
  finalRuling?: bigint;
  aggregation?: Aggregation;
}

/**
 * Display-grade Dispute account for seeding the AppHarness query cache.
 * Fills every field the list/detail views render; fields no view reads
 * carry type-shaped sentinels. Cast-verified stand-in — never feed this
 * to on-chain logic or codecs.
 */
export function makeDispute(f: DisputeFixture): Account<Dispute> {
  const data = {
    discriminator: new Uint8Array(8),
    subaccord: (f.subaccord ?? ZERO_ADDRESS) as Address,
    filer: (f.filer ?? ZERO_ADDRESS) as Address,
    nonce: 0n,
    numOptions: 2,
    options: [new Uint8Array(32), new Uint8Array(32)],
    evidenceHashes: [new Uint8Array(32)],
    state: f.state ?? DisputeState.Created,
    currentRound: f.currentRound ?? 0,
    terms: {
      alphaBps: 1000,
      minStake: 10_000_000n,
      feePerJuror: 1_000_000n,
      reviewWindow: 3600n,
      commitWindow: 3600n,
      revealWindow: 3600n,
      appealWindow: 86_400n,
      maxAppeals: 2,
      minJurySize: 5,
      aggregation: f.aggregation ?? Aggregation.Plurality,
      revealThresholdBps: 6000,
      shortfallPolicy: 0,
      maxDrawAttempts: 3,
      coherenceTolBps: 500,
    },
    finalRuling: f.finalRuling ?? NO_RULING,
    finalizedAt: 0n,
    feePaid: 5_000_000n,
    committedVrf: null,
    frozenRoot: new Uint8Array(32),
  } as unknown as Dispute;
  return { address: f.address as Address, data } as unknown as Account<Dispute>;
}
