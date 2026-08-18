import { $ } from "bun";
import { expect, describe, it } from "bun:test";

import { parseOptions, parseHash32 } from "../../../src/commands/dispute/create.js";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

const HEX32 = "0a".repeat(32); // 64-char hex → 32 bytes

/**
 * dispute:create — ChainCommand (sends). Help smoke + real-output assertions on
 * the exported pure parsers (`parseOptions`, `parseHash32`). The full Surfpool
 * e2e send lands in the shared e2e suite (cross-epic: needs a Subaccord from
 * lifecycle:create-subaccord). `--fee auto` ⇔ `requiredFee` is covered by
 * required-fee.test.ts + the `--fee auto` code path reusing the same SDK fn.
 */
describe("useaccord dispute:create", () => {
  it("--help renders usage with --options, --nonce, --fee", async () => {
    const { stdout, exitCode } = await help("dispute:create");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--options");
    expect(stdout).toContain("--nonce");
    expect(stdout).toContain("--fee");
    expect(stdout).toContain("--subaccord");
  });

  it("parseOptions accepts 2..8 hex labels (with/without 0x)", () => {
    const a = "11".repeat(32);
    const b = "0x" + "22".repeat(32);
    const opts = parseOptions(`${a},${b}`);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toHaveLength(32);
    expect(opts[1]).toHaveLength(32);
    expect(Array.from(opts[0].slice(0, 2))).toEqual([0x11, 0x11]);
    expect(Array.from(opts[1].slice(0, 2))).toEqual([0x22, 0x22]);
  });

  it("parseOptions rejects < 2 and > 8 options", () => {
    expect(() => parseOptions(HEX32)).toThrow(/2\.\.8/);
    expect(() => parseOptions(Array(9).fill(HEX32).join(","))).toThrow(/2\.\.8/);
  });

  it("parseHash32 rejects wrong-length hex", () => {
    expect(() => parseHash32("ab", "evidence")).toThrow(/32-byte hex/);
    expect(() => parseHash32("zz".repeat(32), "evidence")).toThrow(/32-byte hex/);
  });
});
