import { $ } from "bun";
import { expect, describe, it } from "bun:test";

// test/commands/draw/ → apps/cli
const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

describe("useaccord draw:request-vrf", () => {
  it("--help renders usage with the Surfpool caveat + required flags", async () => {
    const { stdout, exitCode } = await help("draw:request-vrf");
    expect(exitCode).toBe(0);
    // Surfpool caveat MUST surface prominently (bean acceptance).
    expect(stdout.toLowerCase()).toMatch(/surfnet|surfpool/);
    expect(stdout).toMatch(/revert/i);
    expect(stdout).toContain("--oracle-queue");
    expect(stdout).toContain("--program-identity");
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("--dispute");
  });
});
