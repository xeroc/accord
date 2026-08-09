import { describe, expect, it } from "bun:test";

import { jsonSafe, serialize, summarizeFields, writeOut } from "../../../src/read-io.js";

describe("read-io — jsonSafe / serialize", () => {
  it("serializes bigint as decimal string", () => {
    expect(jsonSafe(1_000_000n)).toBe("1000000");
  });

  it("serializes Uint8Array as 0x-hex", () => {
    expect(jsonSafe(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("0xdeadbeef");
  });

  it("serializes Some/None Options to value|null", () => {
    expect(jsonSafe({ __option: "Some", value: 42n })).toBe("42");
    expect(jsonSafe({ __option: "None" })).toBeNull();
  });

  it("recurses into objects and arrays", () => {
    const out = jsonSafe({ a: 5n, b: new Uint8Array([1, 2]), c: [1n, 2n] });
    expect(out).toEqual({ a: "5", b: "0x0102", c: ["1", "2"] });
  });

  it("serialize() produces pretty JSON", () => {
    const s = serialize({ x: 1n });
    expect(s).toBe('{\n  "x": "1"\n}');
  });
});

describe("read-io — summarizeFields (human rendering)", () => {
  it("skips discriminator + pad* fields", () => {
    const lines = summarizeFields({
      discriminator: new Uint8Array(8),
      pad0: new Uint8Array(4),
      juror: "7xKXtQvLdy2FHQ8b5wLq9u2Qv6M2HpL3xLq5v2Q9wL3u",
      staked: 1_000_000n,
    });
    expect(lines.join("\n")).not.toContain("discriminator");
    expect(lines.join("\n")).not.toContain("pad0");
    expect(lines.join("\n")).toContain("staked");
    expect(lines.join("\n")).toContain("juror");
  });

  it("labels Unix-second bigint fields with ISO time", () => {
    const lines = summarizeFields({ reviewEnd: 1_700_000_000n });
    expect(lines.join("\n")).toContain("2023");
    expect(lines.join("\n")).toContain("1_700_000_000");
  });

  it("truncates base58 addresses", () => {
    const lines = summarizeFields({
      filer: "7xKXtQvLdy2FHQ8b5wLq9u2Qv6M2HpL3xLq5v2Q9wL3u",
    });
    // base58 → truncated form contains the … separator
    expect(lines.join("\n")).toMatch(/…/);
  });

  it("summarises byte + address arrays by length", () => {
    const lines = summarizeFields({
      options: [new Uint8Array(32), new Uint8Array(32)],
      jurors: ["7xKXtQvLdy2FHQ8b5wLq9u2Qv6M2HpL3xLq5v2Q9wL3u"],
    });
    const joined = lines.join("\n");
    expect(joined).toContain("[2 × 32B]");
    expect(joined).toContain("[1]");
  });

  it("empty data yields no field lines", () => {
    expect(summarizeFields(null)).toEqual([]);
    expect(summarizeFields({})).toEqual([]);
  });
});

describe("read-io — writeOut", () => {
  it("writes serialized payload + newline to disk", async () => {
    const path = `/tmp/useaccord-read-test-${Date.now()}.json`;
    writeOut(path, { a: 1n, b: new Uint8Array([0xff]) });
    const text = await Bun.file(path).text();
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({ a: "1", b: "0xff" });
  });
});
