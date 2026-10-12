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

  it("--help documents the gated-pool --attestation flag", async () => {
    const { stdout, exitCode } = await run(["draw:seat", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--attestation");
    expect(stdout).toContain("credential-gated");
  });

  it("draw:submit-panel --help documents --from-seat resume flag", async () => {
    const res = await $`bun run bin/dev.js draw:submit-panel --help`.cwd(cliRoot);
    const stdout = res.stdout.toString();
    expect(res.exitCode).toBe(0);
    expect(stdout).toContain("--from-seat");
    expect(stdout).toContain("Resume from this seat");
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
