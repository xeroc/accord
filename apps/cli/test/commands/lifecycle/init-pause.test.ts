import { $ } from "bun";
import { expect, describe, it } from "bun:test";

// test/commands/lifecycle/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

/**
 * Command smoke tests: help rendering + flag parsing for the migrated
 * lifecycle:init-pause and the new config commands. On-chain sends are
 * exercised against Surfpool manually (see README / verification run).
 */

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

describe("useaccord config:show", () => {
  it("--help renders usage", async () => {
    const { stdout, exitCode } = await help("config:show");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("resolved");
    expect(stdout).toContain("--rpc");
  });
});

describe("useaccord config:balance", () => {
  it("--help renders usage with --token-mint", async () => {
    const { stdout, exitCode } = await help("config:balance");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--token-mint");
  });
});

describe("useaccord lifecycle:init-pause", () => {
  it("--help renders usage with --skip-if-exists", async () => {
    const { stdout, exitCode } = await help("lifecycle:init-pause");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("State");
    expect(stdout).toContain("--skip-if-exists");
  });

  it("errors clearly when no wallet is resolvable", async () => {
    const res = await $`bun run bin/dev.js lifecycle:init-pause`
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
