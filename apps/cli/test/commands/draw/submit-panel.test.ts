import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

describe("useaccord draw:submit-panel", () => {
  it("--help renders usage with --membership + inline resolve flags", async () => {
    const { stdout, exitCode } = await help("draw:submit-panel");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--membership");
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("--dispute");
    expect(stdout).toContain("--round");
    expect(stdout).toContain("--panel-size");
  });
});
