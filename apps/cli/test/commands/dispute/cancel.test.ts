import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

/**
 * dispute:cancel — ChainCommand (sends). Help smoke covering the
 * --remaining-accounts auto|list contract. The full Surfpool e2e lands in the
 * shared suite (needs a stalled Dispute).
 */
describe("useaccord dispute:cancel", () => {
  it("--help renders usage with --remaining-accounts auto|list", async () => {
    const { stdout, exitCode } = await help("dispute:cancel");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--remaining-accounts");
    expect(stdout).toContain("auto");
    expect(stdout).toContain("Dispute PDA");
  });
});
