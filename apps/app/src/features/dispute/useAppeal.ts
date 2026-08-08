import { appealCost, canAppeal } from "@useaccord/sdk";
import { type Account } from "@solana/kit";
import type { Dispute } from "@useaccord/sdk";

export interface AppealInfo {
  eligible: boolean;
  reason?: string;
  newRound: number;
  panel: number;
  fee: bigint;
  bond: bigint;
  total: bigint;
}

/**
 * Compute appeal eligibility + cost — pure SDK helpers, no wallet needed.
 * Used by DisputeDetail to show the appeal section with actionable info.
 */
export function getAppealInfo(
  dispute: Account<Dispute>,
  appealWindowEnd?: bigint,
  nowSec: number = Math.floor(Date.now() / 1000),
): AppealInfo | null {
  const { currentRound, terms } = dispute.data;

  if (!canAppeal(currentRound, terms.maxAppeals)) {
    return {
      eligible: false,
      reason: `Maximum appeals (${terms.maxAppeals}) reached.`,
      newRound: currentRound + 1,
      panel: 0,
      fee: 0n,
      bond: 0n,
      total: 0n,
    };
  }

  if (appealWindowEnd !== undefined && nowSec >= Number(appealWindowEnd)) {
    return {
      eligible: false,
      reason: "Appeal window has closed.",
      newRound: currentRound + 1,
      panel: 0,
      fee: 0n,
      bond: 0n,
      total: 0n,
    };
  }

  const cost = appealCost(currentRound, terms.feePerJuror);
  if (!cost) {
    return {
      eligible: false,
      reason: "Panel overflow — too many rounds.",
      newRound: currentRound + 1,
      panel: 0,
      fee: 0n,
      bond: 0n,
      total: 0n,
    };
  }

  return {
    eligible: true,
    newRound: cost.newRound,
    panel: cost.panel,
    fee: cost.fee,
    bond: cost.bond,
    total: cost.total,
  };
}
