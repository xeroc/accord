import { $ } from "bun";
import { expect, describe, it } from "bun:test";

// test/commands/appeal/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js appeal:open ${args}`.cwd(cliRoot).nothrow();
  return {
    stdout: res.stdout.toString(),
    stderr: res.stderr.toString(),
    exitCode: res.exitCode,
  };
}

describe("useaccord appeal:open", () => {
  it("--help renders usage with --dispute and --appellant", async () => {
    const { stdout, exitCode } = await run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--dispute");
    expect(stdout).toContain("--appellant");
    expect(stdout).toContain("AppealBond");
  });

  it("requires --dispute", async () => {
    const { exitCode, stderr } = await run([]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/--dispute|required/i);
  });

  it("errors clearly when no wallet is resolvable", async () => {
    const res = await $`bun run bin/dev.js appeal:open --dispute 11111111111111111111111111111111`
      .cwd(cliRoot)
      .env({
        ...process.env,
        ANCHOR_WALLET: "",
        ACCORD_KEYPAIR_PATH: "",
        HOME: "/nonexistent-home",
      })
      .nothrow();
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toMatch(/wallet|keypair|Cannot read/i);
  });
});
