// synod.fixtures.spec.ts — pure pins for the Synod e2e-side fixture
// derivations (no validator, runs in every lane incl. offline CI).
//
// These fixtures mirror `programs/synod/src/instructions/file_dispute.rs`
// (`option_label`, `evidence_root`) and `claim.rs` byte-for-byte: u64-LE
// option index, sha256 over ("synod-opt" ‖ case_pda ‖ i_le64), sha256 over
// (case_pda ‖ per-party hashes), and the floor(pot/N) neutral split with the
// last claimant draining the remainder. Known-answer vectors freeze them
// against drift; the e2e specs cross-check the on-chain artifacts against
// these same helpers.

import { address, type Address } from "@solana/kit";
import {
  synodCasePda,
  synodEconomics,
  synodEvidenceHash,
  synodOptionLabel,
  synodRoster,
  SYNOD_PROGRAM_ID,
} from "./setup/fixtures.js";

/** Stable KAT case PDA — the accord program id (never changes). */
const KAT_CASE: Address = address("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed");
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("synod fixtures (pure)", () => {
  it("derives SynodCase PDAs deterministically and nonce-sensitively", async () => {
    const a = await synodCasePda(KAT_CASE, 0n);
    expect(a).toBe(await synodCasePda(KAT_CASE, 0n));
    expect(a).not.toBe(await synodCasePda(KAT_CASE, 1n));
    expect(a).not.toBe(await synodCasePda(SYNOD_PROGRAM_ID, 0n));
  });

  // Known-answer: sha256("synod-opt" ‖ pda32 ‖ i_le64) — u64 LE index.
  it("derives option labels to the pinned vectors", () => {
    expect(hex(synodOptionLabel(KAT_CASE, 0))).toBe(
      "ef0d707b38597c074075293c294a9d23ad1aa85d061162bb0c6a8b58861a401f",
    );
    expect(hex(synodOptionLabel(KAT_CASE, 3))).toBe(
      "6a65210585ce7b44bb0ae76cab7101ff20381d800fcdb96196cc080f2ec43af6",
    );
    expect(synodOptionLabel(KAT_CASE, 0)).not.toEqual(
      synodOptionLabel(KAT_CASE, 1),
    );
  });

  // Known-answer: sha256(pda32 ‖ e_0 ‖ e_1 ‖ e_2), positional slots.
  it("derives the evidence hash to the pinned vector", () => {
    const e = (n: number) => new Uint8Array(32).fill(n);
    expect(hex(synodEvidenceHash(KAT_CASE, [e(1), e(2), e(3)]))).toBe(
      "c766206e4fa512e7bb47090f6767331ad187eb1bf469033abfbbd13901a96872",
    );
    // Positional: swapping slot order changes the commitment.
    expect(
      hex(synodEvidenceHash(KAT_CASE, [e(3), e(2), e(1)])),
    ).not.toBe(hex(synodEvidenceHash(KAT_CASE, [e(1), e(2), e(3)])));
  });

  it("computes payout math with the last claimant draining the vault", () => {
    // Divisible pot: N=3, S=1000, fee=3·7=21 → pot 2979, everyone 993.
    const even = synodEconomics({
      partyCount: 3,
      stake: 1000n,
      feePerJuror: 7n,
      minJurySize: 3,
    });
    expect(even.frozenFee).toBe(21n);
    expect(even.pot).toBe(2979n);
    expect(even.neutralShare).toBe(993n);
    expect(even.lastNeutralShare).toBe(993n);

    // Indivisible pot: N=2, fee=21 → pot 1979; floor share 989, last
    // claimant drains the 1-token remainder (990).
    const odd = synodEconomics({
      partyCount: 2,
      stake: 1000n,
      feePerJuror: 7n,
      minJurySize: 3,
    });
    expect(odd.neutralShare).toBe(989n);
    expect(odd.lastNeutralShare).toBe(990n);

    // Conservation + pot-positive gate (SPEC §Open-time validations) across N.
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const eco = synodEconomics({
        partyCount: n,
        stake: 500n,
        feePerJuror: 7n,
        minJurySize: 3,
      });
      expect(
        BigInt(n - 1) * eco.neutralShare + eco.lastNeutralShare,
      ).toBe(eco.pot);
      expect(eco.pot).toBeGreaterThan(0n);
      expect(eco.failedShare).toBe(500n);
    }
  });

  it("builds distinct rosters with the opener at index 0", async () => {
    const roster = await synodRoster(5);
    expect(roster).toHaveLength(5);
    expect(new Set(roster.map((p) => p.address)).size).toBe(5);
  });
});
