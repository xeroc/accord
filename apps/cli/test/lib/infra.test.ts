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

describe("toCliError — simulation failure logs (kit v7 preflight shape)", () => {
  // Runtime shape of a kit v7 sendTransaction preflight failure:
  // SolanaError(context={logs, ...}, cause=SolanaError(context={code: <program code>, index}))
  function preflightError({ code, logs }: { code?: number; logs: string[] }): Error {
    const cause = Object.assign(new Error("Transaction failed to simulate"), {
      name: "SolanaError",
      context: { __code: 4615026, code, index: 0 },
    });
    return Object.assign(new Error("Transaction simulation failed"), {
      name: "SolanaError",
      context: { __code: -32002, logs },
      cause,
    });
  }

  it("extracts full logs and the nested custom program code", () => {
    const logs = [
      "Program cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed invoke [1]",
      "Program log: Instruction: RequestVrf",
      "Program log: AnchorError occurred. Error Code: 6005.",
      "Program failed: custom program error 0x1775",
    ];
    const mapped = toCliError(preflightError({ code: 6005, logs }));
    expect(mapped.error).toBe("AlreadyPaused");
    expect(mapped.logs).toEqual(logs);
  });

  it("attaches logs for an unknown program code", () => {
    const mapped = toCliError(preflightError({ code: 999999, logs: ["l1", "l2"] }));
    expect(mapped.error).toBe("Custom_999999");
    expect(mapped.logs).toEqual(["l1", "l2"]);
  });

  it("attaches logs even with no program code at all", () => {
    const mapped = toCliError(preflightError({ logs: ["only logs"] }));
    expect(mapped.error).toBe("SolanaError");
    expect(mapped.logs).toEqual(["only logs"]);
  });

  it("finds logs nested behind a plain cause chain", () => {
    const inner = Object.assign(new Error("rpc blew up"), {
      data: { logs: ["deep"] },
    });
    const mapped = toCliError(new Error("Transaction simulation failed", { cause: inner }));
    expect(mapped.logs).toEqual(["deep"]);
  });

  it("leaves logs undefined when the error carries none", () => {
    expect(toCliError(new Error("boom")).logs).toBeUndefined();
  });
});
