import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${args}`.cwd(cliRoot).nothrow();
  return {
    stdout: res.stdout.toString(),
    stderr: res.stderr.toString(),
    exitCode: res.exitCode ?? 0,
  };
}

describe("useaccord draw:seat", () => {
  it("--help renders usage with --membership + --seat", async () => {
    const { stdout, exitCode } = await run(["draw:seat", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--membership");
    expect(stdout).toContain("--seat");
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("--dispute");
  });

  it("errors clearly when --membership file is missing (before loadChain)", async () => {
    // readInput runs before loadChain, so no wallet is needed to exercise this
    // path — a behavior assertion that doesn't depend on a running validator.
    const { stderr, exitCode } = await run([
      "draw:seat",
      "--subaccord",
      "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed",
      "--dispute",
      "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed",
      "--seat",
      "0",
      "--membership",
      "/nonexistent/membership.json",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/membership|ENOENT|no such file|read/i);
  });
});
