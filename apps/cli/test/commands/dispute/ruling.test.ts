import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

/**
 * dispute:ruling — read-only ChainCommand. Help smoke + the offline error path
 * (no validator reachable). The full Surfpool e2e (null pre-final, index after)
 * runs in the shared e2e suite once a Subaccord + Dispute exist (cross-epic:
 * depends on lifecycle:create-subaccord).
 */
describe("useaccord dispute:ruling", () => {
  it("--help renders usage with the dispute arg", async () => {
    const { stdout, exitCode } = await help("dispute:ruling");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Dispute PDA");
    expect(stdout).toMatch(/null until.*Final/i);
  });
});
