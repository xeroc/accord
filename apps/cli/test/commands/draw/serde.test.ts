import { expect, describe, it } from "bun:test";

// Direct import of the topic-local serde — exercises the pipeline wire format
// (resolve-seat/resolve-panel emit, seat/submit-panel consume) without a validator.
import {
  bytesToHex,
  hexToBytes,
  membershipFromJson,
  membershipToJson,
  parseAddress,
} from "../../../src/lib/draw-shared.js";
import type { SeatMembership } from "@useaccord/sdk";

// A canonical base58 address (the Accord program id) — valid for parseAddress.
const ADDR = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed";
const JUROR_HEX = "00".repeat(31) + "01"; // 32 bytes
const SIBLING_HEX = "ab".repeat(32);

function fixture(): SeatMembership {
  return {
    leaf: { juror: hexToBytes(JUROR_HEX), stake: 5_000n },
    index: 2,
    proof: [
      { siblingHash: hexToBytes(SIBLING_HEX), siblingSum: 1_000n },
      { siblingHash: hexToBytes("ff".repeat(32)), siblingSum: 4_000n },
    ],
    jurorStake: ADDR,
    retries: 3,
  };
}

describe("draw-shared membership serde (CLI.md §1.6 pipeline format)", () => {
  it("round-trips a SeatMembership through JSON losslessly", () => {
    const original = fixture();
    const json = membershipToJson(original);
    const revived = membershipFromJson(json);

    // bytes
    expect(bytesToHex(revived.leaf.juror)).toBe(JUROR_HEX);
    expect(revived.leaf.stake).toBe(5_000n);
    expect(revived.index).toBe(2);
    expect(revived.proof.length).toBe(2);
    expect(bytesToHex(revived.proof[0]!.siblingHash)).toBe(SIBLING_HEX);
    expect(revived.proof[0]!.siblingSum).toBe(1_000n);
    expect(revived.proof[1]!.siblingSum).toBe(4_000n);
    expect(revived.jurorStake).toBe(ADDR);
    expect(revived.retries).toBe(3);
  });

  it("produces JSON-safe values (hex strings + decimal bigint strings)", () => {
    const json = membershipToJson(fixture());
    // bytes → lowercase hex (no 0x prefix); bigint → decimal string.
    expect(json.leaf.juror).toBe(JUROR_HEX);
    expect(json.leaf.stake).toBe("5000");
    expect(json.proof[0]!.siblingHash).toBe(SIBLING_HEX);
    expect(json.proof[0]!.siblingSum).toBe("1000");
    expect(json.jurorStake).toBe(ADDR);
    expect(json.retries).toBe(3);
    // The whole object must serialize with plain JSON.stringify (no bigint).
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  it("rejects malformed membership JSON with a clear error", () => {
    expect(() => membershipFromJson(null)).toThrow(/InvalidMembershipJson/);
    expect(() => membershipFromJson({})).toThrow(/InvalidMembershipJson/);
    // bad hex length on juror
    expect(() =>
      membershipFromJson({
        ...membershipToJson(fixture()),
        leaf: { juror: "deadbeef", stake: "1" },
      }),
    ).toThrow(/leaf\.juror must be 32 bytes/);
    // non-integer stake
    expect(() =>
      membershipFromJson({
        ...membershipToJson(fixture()),
        leaf: { juror: JUROR_HEX, stake: "not-a-number" },
      }),
    ).toThrow(/leaf\.stake/);
    // negative retries
    expect(() => membershipFromJson({ ...membershipToJson(fixture()), retries: -1 })).toThrow(
      /retries/,
    );
  });

  it("parseAddress validates base58 + brands the string", () => {
    expect(parseAddress(ADDR, "test")).toBe(ADDR);
    expect(() => parseAddress("not an address!!", "test")).toThrow(/InvalidAddress/);
    expect(() => parseAddress("tooshort", "test")).toThrow(/InvalidAddress/);
  });

  it("hexToBytes rejects odd-length hex", () => {
    expect(() => hexToBytes("abc")).toThrow(/InvalidHexLength/);
    expect(hexToBytes("0x" + JUROR_HEX).length).toBe(32);
  });
});
