import { $ } from "bun";
import { describe, expect, it } from "bun:test";

// test/commands/read/ → apps/cli
const cliRoot = import.meta.dir + "/../../..";

const COMMANDS = [
  "read:subaccord",
  "read:dispute",
  "read:round",
  "read:juror-stake",
  "read:pause-state",
  "read:pending-update",
  "read:appeal-bond",
  "read:disputes",
  "read:juror-stakes",
  "read:subaccords",
  "read:phase",
] as const;

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

describe("useaccord read:* — help rendering", () => {
  for (const cmd of COMMANDS) {
    it(`${cmd} --help renders usage with --out`, async () => {
      const { stdout, exitCode } = await help(cmd);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--out");
      expect(stdout).toContain("--rpc");
    });
  }

  it("read:appeal-bond requires --dispute + --round-idx", async () => {
    const { stdout } = await help("read:appeal-bond");
    expect(stdout).toContain("--dispute");
    expect(stdout).toContain("--round-idx");
  });

  it("read:phase documents --round", async () => {
    const { stdout } = await help("read:phase");
    expect(stdout).toContain("--dispute");
    expect(stdout).toContain("--round");
  });
});

describe("useaccord read:* — filter guards (no validator needed)", () => {
  it("read:disputes errors without exactly one filter", async () => {
    const res = await $`bun run bin/dev.js read:disputes`
      .cwd(cliRoot)
      .env({ ...process.env, ACCORD_RPC_URL: "http://127.0.0.1:8899" })
      .nothrow();
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toMatch(/exactly one of --by-subaccord/i);
  });

  it("read:juror-stakes errors without exactly one filter", async () => {
    const res = await $`bun run bin/dev.js read:juror-stakes`
      .cwd(cliRoot)
      .env({ ...process.env, ACCORD_RPC_URL: "http://127.0.0.1:8899" })
      .nothrow();
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toMatch(/exactly one of --by-subaccord/i);
  });
});
