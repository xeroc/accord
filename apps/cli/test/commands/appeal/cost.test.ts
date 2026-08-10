import { $ } from "bun";
import { expect, describe, it } from "bun:test";

// test/commands/appeal/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

const FEE_PER_JUROR = "1000000"; // base units (BigInt rejects underscores)

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js appeal:cost ${args}`.cwd(cliRoot).nothrow();
  return {
    stdout: res.stdout.toString(),
    stderr: res.stderr.toString(),
    exitCode: res.exitCode,
  };
}

describe("useaccord appeal:cost", () => {
  it("--help renders usage", async () => {
    const { stdout, exitCode } = await run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--current-round");
    expect(stdout).toContain("--fee-per-juror");
    expect(stdout).toContain("bond");
  });

  it("quotes the round-0→1 appeal (panel 7, total = 2·fee·7)", async () => {
    // First appeal: currentRound 0 → newRound 1, panel 7. fee = 7·fpj, bond = fee,
    // total = 14·fpj. Matches the on-chain `appeal` math + appealCost() in the SDK.
    const { stdout, exitCode } = await run([
      "--current-round",
      "0",
      "--fee-per-juror",
      FEE_PER_JUROR,
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.newRound).toBe(1);
    expect(out.panel).toBe(7);
    // bigints serialize as decimal strings (jsonStringify) — jq-friendly.
    expect(out.fee).toBe("7000000");
    expect(out.bond).toBe("7000000");
    expect(out.total).toBe("14000000");
  });

  it("honors --quiet (prints only the total)", async () => {
    const { stdout, exitCode } = await run([
      "--current-round",
      "0",
      "--fee-per-juror",
      FEE_PER_JUROR,
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("14000000");
  });

  it("rejects a non-integer --fee-per-juror", async () => {
    const { exitCode, stderr } = await run([
      "--current-round",
      "0",
      "--fee-per-juror",
      "not-a-number",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/fee-per-juror|integer/i);
  });
});
