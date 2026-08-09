import { $ } from "bun";
import { expect, describe, it, beforeAll } from "bun:test";

// test/commands/lifecycle/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

/**
 * Per-command smoke tests for the lifecycle topic (CLI.md §3). Each command:
 *   - renders --help with its key flags
 *   - builds a real instruction under --dry-run (no validator needed; dry-run
 *     never calls sendInstruction/getLatestBlockhash)
 *   - maps its validation errors to a stable CLI shape
 *
 * Live sends against Surfpool are exercised separately (README verification
 * run); the offline dry-run is the deterministic contract gate here.
 */

// A throwaway keypair so dry-run commands can resolve the single-signer wallet.
const KP_PATH = "/tmp/opencode/useaccord-lifecycle-test-id.json";
const KP_FLAG = ["-k", KP_PATH];

beforeAll(async () => {
  // Generate a valid ed25519 keypair the same way every Solana keypair file
  // in this repo is made. The toolchain is installed by `make prep`.
  await $`solana-keygen new --no-bip39-passphrase --silent --force --outfile ${KP_PATH}`.quiet();
});

async function run(
  topic: string,
  extra: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} ${[...extra, ...KP_FLAG]}`
    .cwd(cliRoot)
    .env({ ...process.env, ACCORD_RPC_URL: "http://127.0.0.1:8899" })
    .nothrow();
  return {
    stdout: res.stdout.toString(),
    stderr: res.stderr.toString(),
    exitCode: res.exitCode,
  };
}

async function help(topic: string): Promise<string> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return res.stdout.toString();
}

// Reused fake addresses (shape-valid base58; never sent on-chain here).
const MINT = "EPjFWd5Y2Jt14AJuqNDwheelKMqjRgAgBpDFk2d8Qj9";
const SUBACCORD = "9n1DaBtKmWxKJNpYfQesuCgN6TVWkHCXrA7B8cd3p7wc";
const PENDING = "AaNWSA1SajQEAM9bps1kD8AoPupnGwDci7XKr5VaXVG9";
const ZERO_32 = "0".repeat(64);
const HEX_1 = "0".repeat(63) + "1";
const createArgs = (extra: string[] = []): string[] => [
  "--dry-run",
  "--random-risk-type",
  "--evidence-spec",
  HEX_1,
  "--staking-token",
  MINT,
  "--fee-token",
  MINT,
  "--min-stake",
  "1000",
  "--alpha-bps",
  "1000",
  "--review-window",
  "604800",
  "--commit-window",
  "172800",
  "--reveal-window",
  "172800",
  "--appeal-window",
  "259200",
  "--max-appeals",
  "3",
  "--fee-per-juror",
  "0",
  "--reveal-threshold-bps",
  "6666",
  "--max-draw-attempts",
  "3",
  "--evidence-operator",
  SUBACCORD,
  ...extra,
];

/** Same as createArgs but with an explicit --risk-type instead of --random-risk-type. */
const createArgsRiskType = (riskTypeHex: string): string[] => {
  const base = createArgs().filter((f) => f !== "--random-risk-type");
  return [...base, "--risk-type", riskTypeHex];
};

describe("useaccord lifecycle:create-subaccord", () => {
  it("--help renders the heavy arg surface", async () => {
    const stdout = await help("lifecycle:create-subaccord");
    expect(stdout).toContain("--random-risk-type");
    expect(stdout).toContain("--staking-token");
    expect(stdout).toContain("--reveal-threshold-bps");
    expect(stdout).toContain("--shortfall-policy");
    // Single-signer model: there is no --authority flag.
    expect(stdout).not.toMatch(/--authority\b/);
  });

  it("--dry-run builds an instruction", async () => {
    const { stdout, exitCode } = await run("lifecycle:create-subaccord", createArgs());
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[dry-run] instruction built");
    expect(stdout).toContain("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed");
  });

  it("rejects a zero risk_type before chain load", async () => {
    const { exitCode, stderr } = await run(
      "lifecycle:create-subaccord",
      createArgsRiskType(ZERO_32),
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/InvalidRiskType/);
  });
});

describe("useaccord lifecycle:propose-update", () => {
  it("--help renders --payload and --nonce", async () => {
    const stdout = await help("lifecycle:propose-update");
    expect(stdout).toContain("--payload");
    expect(stdout).toContain("--nonce");
    expect(stdout).toContain("--subaccord");
  });

  it("--dry-run builds an instruction for a bigint payload", async () => {
    const { stdout, exitCode } = await run("lifecycle:propose-update", [
      "--dry-run",
      "--subaccord",
      SUBACCORD,
      "--payload",
      "MinStake:2000",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[dry-run] instruction built");
  });

  it("--dry-run builds an instruction for an address payload", async () => {
    const { stdout, exitCode } = await run("lifecycle:propose-update", [
      "--dry-run",
      "--subaccord",
      SUBACCORD,
      "--payload",
      `Authority:${SUBACCORD}`,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[dry-run] instruction built");
  });

  it("rejects an unknown payload kind", async () => {
    const { exitCode, stderr } = await run("lifecycle:propose-update", [
      "--dry-run",
      "--subaccord",
      SUBACCORD,
      "--payload",
      "Bogus:1",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/InvalidPayload/);
  });
});

describe("useaccord lifecycle:execute-update", () => {
  it("--help renders --pending-update", async () => {
    const stdout = await help("lifecycle:execute-update");
    expect(stdout).toContain("--pending-update");
    expect(stdout).toContain("--subaccord");
  });

  it("--dry-run builds an instruction", async () => {
    const { stdout, exitCode } = await run("lifecycle:execute-update", [
      "--dry-run",
      "--subaccord",
      SUBACCORD,
      "--pending-update",
      PENDING,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[dry-run] instruction built");
  });
});

describe("useaccord lifecycle:pause", () => {
  it("--help renders (no own flags)", async () => {
    const stdout = await help("lifecycle:pause");
    expect(stdout).toContain("pause-authority");
  });

  it("--dry-run builds an instruction against the PauseState singleton", async () => {
    const { stdout, exitCode } = await run("lifecycle:pause", ["--dry-run"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[dry-run] instruction built");
    // PauseState PDA is derived; it should appear in the account list.
    expect(stdout).toContain("AaNWSA1SajQEAM9bps1kD8AoPupnGwDci7XKr5VaXVG9");
  });
});

describe("useaccord lifecycle:propose-unpause", () => {
  it("--help renders the timelock description", async () => {
    const stdout = await help("lifecycle:propose-unpause");
    expect(stdout).toContain("timelock");
  });

  it("--dry-run builds an instruction", async () => {
    const { stdout, exitCode } = await run("lifecycle:propose-unpause", ["--dry-run"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[dry-run] instruction built");
  });
});

describe("useaccord lifecycle:execute-unpause", () => {
  it("--help renders (permissionless crank)", async () => {
    const stdout = await help("lifecycle:execute-unpause");
    expect(stdout).toContain("permissionless");
  });

  it("--dry-run builds an instruction", async () => {
    const { stdout, exitCode } = await run("lifecycle:execute-unpause", ["--dry-run"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[dry-run] instruction built");
  });
});
