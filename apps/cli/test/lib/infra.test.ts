import { expect, describe, it } from "bun:test";

import {
  truncateAddress,
  groupBigInt,
  isoFromUnixSeconds,
  accountRoleLabel,
} from "../../src/lib/format.js";
import { renderSend, renderCreated, renderRead } from "../../src/lib/output.js";
import { toCliError } from "../../src/lib/errors.js";

describe("format", () => {
  it("truncates long addresses and leaves short ones whole", () => {
    expect(truncateAddress("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed")).toBe("cordh…yKed");
    expect(truncateAddress("abc")).toBe("abc");
  });

  it("groups bigints with underscores", () => {
    expect(groupBigInt(1000000n)).toBe("1_000_000");
    expect(groupBigInt(0)).toBe("0");
    expect(groupBigInt(-1234567n)).toBe("-1_234_567");
  });

  it("renders unix-seconds as ISO, null-safe", () => {
    expect(isoFromUnixSeconds(0)).toBe("1970-01-01T00:00:00.000Z");
    expect(isoFromUnixSeconds(null)).toBeNull();
  });

  it("labels Kit account roles", () => {
    // READONLY=0, WRITABLE=1, READONLY_SIGNER=2, WRITABLE_SIGNER=3
    expect(accountRoleLabel(0)).toBe("readonly");
    expect(accountRoleLabel(1)).toBe("writable");
    expect(accountRoleLabel(2)).toBe("readonly signer");
    expect(accountRoleLabel(3)).toBe("writable signer");
  });
});

describe("output renderers", () => {
  it("renderSend: quiet=sig, json=object, human=✓ line", () => {
    const sig = "4xABCdef";
    expect(renderSend({ quiet: true }, sig)).toBe(sig);
    expect(JSON.parse(renderSend({ json: true }, sig, { pauseState: "PDA" }))).toEqual({
      signature: sig,
      pauseState: "PDA",
    });
    expect(renderSend({}, sig)).toBe(`✓ confirmed: ${sig}`);
  });

  it("renderCreated: quiet=address, json includes address", () => {
    const addr = "AaNWSA1SajQEAM9bps1kD8AoPupnGwDci7XKr5VaXVG9";
    expect(renderCreated({ quiet: true }, addr)).toBe(addr);
    expect(JSON.parse(renderCreated({ json: true }, addr, { bump: 255 }))).toEqual({
      address: addr,
      bump: 255,
    });
  });

  it("renderRead: quiet=primary, json=pretty, human=provided lines", () => {
    const data = { owner: "x", lamports: 5n };
    expect(renderRead({ quiet: true }, data, { primary: "PDA" })).toBe("PDA");
    expect(renderRead({}, data, { human: ["a", "b"] })).toBe("a\nb");
    expect(JSON.parse(renderRead({ json: true }, { owner: "x" }))).toEqual({ owner: "x" });
  });
});

describe("toCliError", () => {
  it("maps a known Anchor custom code to its AccordError name", () => {
    // AlreadyPaused = BASE(6000) + 5 = 6005
    const err = new Error("Custom program error: #6005");
    const mapped = toCliError(err);
    expect(mapped.error).toBe("AlreadyPaused");
    expect(mapped.exitCode).toBe(1);
  });

  it("maps a decimal code and an unknown code to Custom_<n>", () => {
    expect(toCliError(new Error("Custom program error: #999999")).error).toBe("Custom_999999");
  });

  it("flags RPC reachability errors with a hint", () => {
    const mapped = toCliError(new Error("fetch failed: ECONNREFUSED 127.0.0.1:8899"));
    expect(mapped.error).toBe("RpcUnreachable");
    expect(mapped.hint).toBeTruthy();
  });

  it("passes through a plain error", () => {
    const mapped = toCliError(new Error("boom"));
    expect(mapped.error).toBe("Error");
    expect(mapped.message).toBe("boom");
  });
});
