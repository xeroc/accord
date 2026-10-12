import { describe, expect, it } from "bun:test";

import type { Dispute } from "@useaccord/sdk";

import { disputeView, renderDisputeHuman } from "../../src/lib/dispute-view.js";

const NOT_ZERO = new Uint8Array(Buffer.from("ab".repeat(32), "hex"));

/** Minimal realistic Dispute: round-1, VRF committed, not yet final. */
function fixture(overrides: Partial<Dispute> = {}): Dispute {
  return {
    discriminator: new Uint8Array(Buffer.from("2431f1432824f14a", "hex")),
    subaccord: "SubaQQ1mZeeK7oL1uWBdLqcHRj6APJqBpTPpQqP2smN",
    filer: "FilRzhb2hDHLzWKMTZaYUcJRk7Svx4AsB1Tg5vnPNJG",
    nonce: 7n,
    numOptions: 2,
    options: [
      NOT_ZERO,
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
    ],
    evidenceHashes: [NOT_ZERO, new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
    state: 3, // DisputeState.Commit
    currentRound: 0,
    terms: {
      alphaBps: 2000,
      minStake: 1_000_000n,
      feePerJuror: 50_000n,
      reviewWindow: 3600n,
      commitWindow: 7200n,
      revealWindow: 7200n,
      appealWindow: 86_400n,
      maxAppeals: 3,
      minJurySize: 5,
      aggregation: 0, // Aggregation.Plurality
      revealThresholdBps: 6600,
      shortfallPolicy: 0,
      maxDrawAttempts: 3,
      coherenceTolBps: 500,
    },
    finalRuling: 0xffff_ffff_ffff_ffffn, // NO_RULING sentinel
    finalizedAt: 0n,
    feePaid: 250_000n,
    committedVrf: { __option: "Some", value: NOT_ZERO },
    frozenRoot: NOT_ZERO,
    frozenTotalStake: 12_345_678n,
    filedAt: 1_760_000_000n,
    bump: 254,
    drawnSeats: 5,
    bountyPool: 50_000n,
    padding: new Uint8Array(52),
    ...overrides,
  } as Dispute;
}

describe("disputeView", () => {
  it("labels the state + aggregation and nulls the NO_RULING sentinel", () => {
    const v = disputeView(fixture());
    expect(v.state).toBe("Commit");
    expect(v.finalRuling).toBeNull();
    expect(v.terms.aggregation).toBe("Plurality");
    expect(v.filedAtIso).toBe(new Date(1_760_000_000_000).toISOString());
  });

  it("carries the final ruling + verdict time once Final", () => {
    const v = disputeView(
      fixture({
        state: 6, // Final
        currentRound: 1,
        finalRuling: 1n,
        finalizedAt: 1_760_010_000n,
      }),
    );
    expect(v.finalRuling).toBe("1");
    expect(v.rulingLabel).toContain("option index");
    expect(v.finalizedAtIso).toBe(new Date(1_760_010_000_000).toISOString());
  });

  it("labels a Median ruling as a scalar", () => {
    const v = disputeView(
      fixture({ state: 6, finalRuling: 123_456n, terms: { ...fixture().terms, aggregation: 1 } }),
    );
    expect(v.rulingLabel).toContain("median");
  });

  it("renders VRF/root as hex and marks unset evidence sentinels", () => {
    const v = disputeView(fixture());
    expect(v.committedVrf).toBe(Buffer.from(NOT_ZERO).toString("hex"));
    expect(v.evidenceHashes[0]).not.toBeNull();
    expect(v.evidenceHashes[1]).toBeNull();
    expect(v.committedVrf).toHaveLength(64);
  });

  it("human render includes the load-bearing fields", () => {
    const lines = renderDisputeHuman(disputeView(fixture())).join("\n");
    for (const needle of [
      "state",
      "Commit",
      "filer",
      "currentRound",
      "feePaid",
      "250_000",
      "terms",
      "alphaBps",
    ]) {
      expect(lines).toContain(needle);
    }
  });
});
