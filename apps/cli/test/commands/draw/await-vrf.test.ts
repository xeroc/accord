import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

describe("useaccord draw:await-vrf", () => {
  it("--help renders usage with --timeout and --poll", async () => {
    const { stdout, exitCode } = await help("draw:await-vrf");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--timeout");
    expect(stdout).toContain("--poll");
    expect(stdout).toContain("--dispute");
  });
});
