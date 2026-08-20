import { $ } from "bun";
import { expect, describe, it } from "bun:test";
import { resolveRulesHash } from "../../../src/commands/canon/create-list.js";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

/**
 * canon:* — help smokes for every command (surface + load path), real-output
 * assertions on the exported pure helper (`resolveRulesHash`). Instruction
 * sends are the @useaccord/canon facades already proven by the Surfpool jest
 * suite (`tests/src/canon.spec.ts`, `canon.challenge.spec.ts`); the CLI's
 * derived-address wiring (list back-ref, dispute_count nonce, item payees) is
 * exercised by those same facades' account shapes at type-check time.
 */
describe("useaccord canon:* (help surface)", () => {
  it("canon:create-list renders usage with the creation flags", async () => {
    const { stdout, exitCode } = await help("canon:create-list");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--stake-mint");
    expect(stdout).toContain("--fee-mint");
    expect(stdout).toContain("--rules-hash");
    expect(stdout).toContain("--random-rules-hash");
    expect(stdout).toContain("--submit-deposit");
    expect(stdout).toContain("--challenge-pct");
    expect(stdout).toContain("--listing-window");
    expect(stdout).toContain("--withdrawal-timelock");
    expect(stdout).toContain("--evidence-operator");
    expect(stdout).toContain("--min-stake");
    expect(stdout).toContain("--min-jury-size");
    expect(stdout).toContain("--alpha-bps");
    expect(stdout).toContain("--depth");
  });

  it("canon:submit renders usage with --list, --account, --evidence", async () => {
    const { stdout, exitCode } = await help("canon:submit");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--list");
    expect(stdout).toContain("--account");
    expect(stdout).toContain("--evidence");
  });

  it("crank + withdraw commands render usage with --item", async () => {
    for (const cmd of [
      "canon:advance-pending",
      "canon:challenge",
      "canon:settle",
      "canon:request-withdrawal",
      "canon:advance-withdrawal",
      "canon:close-item",
    ]) {
      const { stdout, exitCode } = await help(cmd);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--item");
    }
  });

  it("read commands render usage with the address arg", async () => {
    for (const cmd of ["canon:list", "canon:item"]) {
      const { stdout, exitCode } = await help(cmd);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("ADDRESS");
    }
    for (const cmd of ["canon:lists", "canon:items"]) {
      const { exitCode } = await help(cmd);
      expect(exitCode).toBe(0);
    }
  });
});

describe("resolveRulesHash (canon:create-list)", () => {
  const HEX32 = "ab".repeat(32);

  it("parses explicit hex (with/without 0x)", () => {
    expect(Array.from(resolveRulesHash(false, HEX32).slice(0, 2))).toEqual([0xab, 0xab]);
    expect(Array.from(resolveRulesHash(false, "0x" + HEX32).slice(0, 2))).toEqual([0xab, 0xab]);
  });

  it("random mode mints fresh non-zero hashes", () => {
    const a = resolveRulesHash(true);
    const b = resolveRulesHash(true);
    expect(a).toHaveLength(32);
    expect(a).not.toEqual(b); // collision odds aside, two draws differ
    expect(a.some((byte) => byte !== 0)).toBe(true); // zero hash rejected on-chain
  });

  it("neither flag nor hex ⇒ clear error", () => {
    expect(() => resolveRulesHash(false)).toThrow(/RulesHash/);
    expect(() => resolveRulesHash(false, "zz".repeat(32))).toThrow(/RulesHash/);
  });
});
