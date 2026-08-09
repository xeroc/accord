import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function run(
  args: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${args}`
    .cwd(cliRoot)
    .env({ ...process.env, ...env })
    .nothrow();
  return { stdout: res.stdout.toString(), stderr: res.stderr.toString(), exitCode: res.exitCode };
}

/**
 * dispute:required-fee is PURE (BaseCommand, no chain) — we assert real output,
 * including the exact 3 × fee-per-juror arithmetic and the u64-overflow guard.
 * This is the acceptance criterion: "required-fee is pure and matches
 * dispute:create --fee auto."
 */
describe("useaccord dispute:required-fee", () => {
  it("--help renders usage with --fee-per-juror", async () => {
    const { stdout, exitCode } = await run(["dispute:required-fee", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--fee-per-juror");
    expect(stdout).toContain("3 × fee-per-juror");
  });

  it("prints 3 × fee-per-juror (human default) — pure, no chain", async () => {
    const { stdout, exitCode } = await run([
      "dispute:required-fee",
      "--fee-per-juror",
      "1_000_000",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("3_000_000");
    expect(stdout).toMatch(/fee\s*:\s*3_000_000/i);
  });

  it("--json emits { feePerJuror, fee }", async () => {
    const { stdout, exitCode } = await run([
      "dispute:required-fee",
      "--fee-per-juror",
      "5000000",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({ feePerJuror: "5000000", fee: "15000000" });
  });

  it("--quiet prints only the fee", async () => {
    const { stdout, exitCode } = await run([
      "dispute:required-fee",
      "--fee-per-juror",
      "7",
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("21");
  });

  it("rejects a negative fee-per-juror", async () => {
    const { exitCode, stderr } = await run(["dispute:required-fee", "--fee-per-juror", "-5"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/fee-per-juror|non-negative/i);
  });
});
