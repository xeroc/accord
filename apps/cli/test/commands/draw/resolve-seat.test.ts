import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

describe("useaccord draw:resolve-seat", () => {
  it("--help renders usage with seat/round/out flags", async () => {
    const { stdout, exitCode } = await help("draw:resolve-seat");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--dispute");
    expect(stdout).toContain("--seat");
    expect(stdout).toContain("--round");
    expect(stdout).toContain("--out");
    expect(stdout).toContain("--draw-attempt");
  });
});
