// Chain sends (create-subaccord, propose/execute-*) stay untested here: no
// admin keypair in CI and no devnet state writes. Pure/offline surface only —
// the Surfpool e2e covers the send path in the shared suite.
import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

describe("useaccord lifecycle:create-subaccord", () => {
  it("--help renders the scalar-voting flags (ADR-0025)", async () => {
    const { stdout, exitCode } = await help("lifecycle:create-subaccord");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--aggregation");
    expect(stdout).toContain("plurality");
    expect(stdout).toContain("median");
    expect(stdout).toContain("--coherence-tol-bps");
  });
});
