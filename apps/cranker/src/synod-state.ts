/**
 * Synod state resolver — pure mapping from a decoded (SynodCase, Dispute)
 * snapshot to the next Synod permissionless crank action, or `null` when the
 * case is waiting on the roster, the join deadline, or Accord's ruling (bean
 * accord-i1mp).
 *
 * Synod is an Arbitrable over Accord: it owns the party roster + escrow pot;
 * Accord owns the ruling. The three cranks (SPEC §Instructions #3/#4/#5):
 *   - `file_dispute`        — Opening + full roster → CPI create_dispute, Live
 *   - `refund_roster_miss`  — Opening + deadline + incomplete roster → per
 *                             joined-unpaid party, stake `S` back, one per cycle
 *   - `claim`               — Live + dispute Final/Failed → per unclaimed party,
 *                             pot / floor share / full `S`, one per cycle
 *
 * Gates mirror the on-chain handlers exactly
 * (programs/synod/src/instructions/{file_dispute,refund_roster_miss,claim}.rs);
 * `now` is a Unix-seconds timestamp matching `Clock::get().unix_timestamp`.
 * `dispute` is the bound Accord dispute's decoded data, resolved by the caller
 * (the reconciler reuses its Dispute scan) — only `state` + `finalRuling` are
 * read. It is `null` for Opening cases (dispute not bound yet) or when the
 * dispute is unknown to the cycle; then claim never fires (the tx would revert
 * with DisputeNotFinal).
 *
 * One action per case per cycle (no bundling — canon-state.ts contract): the
 * per-party refund/claim sweeps pick the LOWEST eligible slot; the next cycle
 * picks up the next party. The `paid_out` bits make replays no-ops on-chain.
 */
import { CaseState, type SynodCase } from "@useaccord/synod";
import { DisputeState, NO_RULING, type Dispute } from "@useaccord/sdk";

export type SynodCrankAction =
  | { readonly kind: "synod_file_dispute" }
  | { readonly kind: "synod_refund_roster_miss"; readonly partyIndex: number }
  | { readonly kind: "synod_claim"; readonly partyIndex: number };

/** The bits of the bound Accord dispute the resolver reads. */
export type BoundDispute = Pick<Dispute, "state" | "finalRuling">;

/**
 * Lowest joined-and-unpaid slot `[0, party_count)`, or `null` — the refund
 * eligibility (on-chain: PartyNotJoined for absent bits, no-op replay for paid
 * ones). Claim's neutral/Failed sweeps use the same predicate: at Live the
 * roster is full, so joined ⊇ every slot anyway.
 */
function firstJoinedUnpaid(kase: SynodCase): number | null {
  for (let i = 0; i < kase.partyCount; i++) {
    if ((kase.joined & (1 << i)) !== 0 && (kase.paidOut & (1 << i)) === 0) return i;
  }
  return null;
}

/**
 * Resolve the next Synod crank action for a (case, bound dispute) snapshot, or
 * `null` when waiting. Claim dispatches on the Final ruling: option index
 * `< party_count` is the prevailing party (one-shot pot pull — only that slot
 * is eligible, a non-winner claim is a deliberate on-chain no-op and must not
 * consume the cycle), `== party_count` is neutral (every party pulls a share).
 */
export function resolveSynodAction(
  kase: SynodCase,
  dispute: BoundDispute | null,
  now: bigint,
): SynodCrankAction | null {
  switch (kase.state) {
    case CaseState.Opening:
      // Full roster: early lock — file regardless of the deadline
      // (on-chain: joined == (1 << party_count) - 1).
      if (kase.joined === (1 << kase.partyCount) - 1) {
        return { kind: "synod_file_dispute" };
      }
      // Roster miss: refund one joined-unpaid party per cycle. Deadline gate
      // is `>=` (Clock::get().unix_timestamp >= join_deadline on-chain).
      if (now >= kase.joinDeadline) {
        const i = firstJoinedUnpaid(kase);
        return i === null ? null : { kind: "synod_refund_roster_miss", partyIndex: i };
      }
      return null;
    case CaseState.Live: {
      // claim reads only Final/Failed (DisputeNotFinal otherwise; ties redraw
      // at Accord — Synod never handles them).
      if (dispute === null) return null;
      if (dispute.state !== DisputeState.Final && dispute.state !== DisputeState.Failed) {
        return null;
      }
      if (dispute.state === DisputeState.Failed) {
        // Fee already returned by cancel_dispute: every party pulls full `S`.
        const i = firstJoinedUnpaid(kase);
        return i === null ? null : { kind: "synod_claim", partyIndex: i };
      }
      // Final: ruling is the winning option index (party i ≡ option i, neutral
      // at party_count). NO_RULING under Final is an invariant break — the
      // on-chain claim would err; nothing to crank. A ruling above neutral
      // errs InvalidRuling — same.
      if (dispute.finalRuling === NO_RULING) return null;
      const n = BigInt(kase.partyCount);
      if (dispute.finalRuling > n) return null;
      if (dispute.finalRuling < n) {
        // Prevailing party takes the whole pot — one-shot, winner only.
        const winner = Number(dispute.finalRuling);
        return (kase.paidOut & (1 << winner)) !== 0
          ? null
          : { kind: "synod_claim", partyIndex: winner };
      }
      // Neutral: floor share per party; the last claimant drains the vault.
      const i = firstJoinedUnpaid(kase);
      return i === null ? null : { kind: "synod_claim", partyIndex: i };
    }
    default:
      // Closed: terminal — all outstanding per-party payouts settled.
      return null;
  }
}
