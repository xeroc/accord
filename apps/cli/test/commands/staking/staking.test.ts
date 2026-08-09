import { $ } from "bun";
import { expect, describe, it } from "bun:test";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// test/commands/staking/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${args}`.cwd(cliRoot).nothrow();
  return {
    stdout: res.stdout.toString(),
    stderr: res.stderr.toString(),
    exitCode: res.exitCode ?? 0,
  };
}

describe("useaccord staking:stake", () => {
  it("--help renders usage with --subaccord, --amount, --path-from", async () => {
    const { stdout, exitCode } = await help("staking:stake");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("--amount");
    expect(stdout).toContain("--path-from");
    expect(stdout).toContain("--pause-state");
  });
});

describe("useaccord staking:request-withdraw", () => {
  it("--help renders usage", async () => {
    const { stdout, exitCode } = await help("staking:request-withdraw");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("--amount");
  });
});

describe("useaccord staking:withdraw", () => {
  it("--help renders usage", async () => {
    const { stdout, exitCode } = await help("staking:withdraw");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--subaccord");
  });
});

describe("useaccord staking:reconcile", () => {
  it("--help renders usage", async () => {
    const { stdout, exitCode } = await help("staking:reconcile");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--juror");
    expect(stdout).toContain("--path-from");
  });
});

describe("useaccord staking:withdraw-fees", () => {
  it("--help renders usage", async () => {
    const { stdout, exitCode } = await help("staking:withdraw-fees");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--subaccord");
  });
});

describe("useaccord staking:can-unstake (pure, no send)", () => {
  it("--help renders usage", async () => {
    const { stdout, exitCode } = await help("staking:can-unstake");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--staked");
    expect(stdout).toContain("--active-draws");
    expect(stdout).toContain("--amount");
  });

  it("reports canUnstake=true when amount > 0, no draws, amount ≤ staked", async () => {
    const { stdout, exitCode } = await run([
      "staking:can-unstake",
      "--staked",
      "1000",
      "--active-draws",
      "0",
      "--amount",
      "500",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.canUnstake).toBe(true);
    expect(parsed.activeDraws).toBe(0);
    expect(parsed.reason).toBeUndefined();
  });

  it("reports reason=StakeLocked when active_draws > 0", async () => {
    const { stdout, exitCode } = await run([
      "staking:can-unstake",
      "--staked",
      "1000",
      "--active-draws",
      "2",
      "--amount",
      "500",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.canUnstake).toBe(false);
    expect(parsed.reason).toBe("StakeLocked");
  });

  it("reports reason=InsufficientBalance when amount > staked", async () => {
    const { stdout, exitCode } = await run([
      "staking:can-unstake",
      "--staked",
      "100",
      "--active-draws",
      "0",
      "--amount",
      "500",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.canUnstake).toBe(false);
    expect(parsed.reason).toBe("InsufficientBalance");
  });

  it("reports reason=InvalidAmount when amount is zero", async () => {
    const { stdout, exitCode } = await run([
      "staking:can-unstake",
      "--staked",
      "1000",
      "--active-draws",
      "0",
      "--amount",
      "0",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.canUnstake).toBe(false);
    expect(parsed.reason).toBe("InvalidAmount");
  });

  it("human mode prints canUnstake : yes/no line", async () => {
    const { stdout, exitCode } = await run([
      "staking:can-unstake",
      "--staked",
      "1000",
      "--active-draws",
      "1",
      "--amount",
      "500",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("canUnstake : no");
    expect(stdout).toContain("reason     : StakeLocked");
  });
});

describe("useaccord staking:stake (offline error paths)", () => {
  it("errors clearly when no wallet is resolvable", async () => {
    const res =
      await $`bun run bin/dev.js staking:stake --subaccord 11111111111111111111111111111111 --amount 1000`
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

  it("fails fast on a malformed --path-from file (before any network call)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "accord-proof-"));
    const bad = join(dir, "bad.json");
    await writeFile(bad, "not json {");
    const res =
      await $`bun run bin/dev.js staking:stake --subaccord 11111111111111111111111111111111 --amount 1000 --path-from ${bad} --dry-run`
        .cwd(cliRoot)
        .env({ ...process.env, HOME: "/nonexistent-home" })
        .nothrow();
    expect(res.exitCode).not.toBe(0);
    // File parse error surfaces, not a network/wallet error.
    expect(res.stderr.toString()).toMatch(/InvalidProofFile|not valid JSON/i);
  });

  it("fails fast on a --path-from file missing the path array", async () => {
    const dir = await mkdtemp(join(tmpdir(), "accord-proof-"));
    const bad = join(dir, "noarray.json");
    await writeFile(bad, JSON.stringify({ foo: 1 }));
    const res =
      await $`bun run bin/dev.js staking:stake --subaccord 11111111111111111111111111111111 --amount 1000 --path-from ${bad} --dry-run`
        .cwd(cliRoot)
        .env({ ...process.env, HOME: "/nonexistent-home" })
        .nothrow();
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toMatch(/InvalidProofFile|path.*array/i);
  });
});
