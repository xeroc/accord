import { $ } from "bun";
import { expect, describe, it } from "bun:test";

// test/commands/vote/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

// Known cross-check vectors (ADR-0025: preimage = vote_le[8] ‖ salt[32] ‖
// juror[32], 72 bytes), computed independently of the SDK (python hashlib):
//   sha256(01 00..00 ‖ 0x01*32 ‖ 0x02*32)              — vote 1 (option index)
//   sha256(123450000 LE ‖ 0x01*32 ‖ 0x02*32)           — scalar "123.45" @ 6 dp
// The CLI's `vote:commit-hash` must emit exactly these — proving the pure
// command matches the on-chain hashv. JUROR is the base58 of 0x02*32, the same
// juror bytes the SDK's own reference vector pins.
const SALT_HEX = "01".repeat(32);
const JUROR = "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR";
const EXPECTED_COMMITMENT = "9b20b90126bf0bb4819d4fcbe4d57777f61953a78b4d8753ccec94ea2b676828";
const EXPECTED_SCALAR_COMMITMENT =
  "b222223c2b73a5ce8d676c5d961e6aa516bb8c286e69a033d4b2c5bdecfae9e9";

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

/**
 * Vote topic smoke tests: help rendering + flag parsing for every command.
 * The pure `vote:commit-hash` additionally cross-checks the output against the
 * known SDK commit-hash vector. Chain sends (commit/reveal/finalize/redraw) are
 * exercised against Surfpool via the e2e harness (needs a drawn panel — coord
 * with the draw topic); here we cover the build path + flag surface.
 */
describe("useaccord vote:commit-hash", () => {
  it("--help renders usage with --vote/--decimals/--salt/--juror", async () => {
    const { stdout, exitCode } = await help("vote:commit-hash");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--vote");
    expect(stdout).toContain("--decimals");
    expect(stdout).toContain("--salt");
    expect(stdout).toContain("--juror");
  });

  it("emits the known commit-hash vector (cross-check vs SDK commitHash)", async () => {
    const res =
      await $`bun run bin/dev.js vote:commit-hash --vote 1 --salt ${SALT_HEX} --juror ${JUROR} --json`.cwd(
        cliRoot,
      );
    const out = JSON.parse(res.stdout.toString());
    expect(out.commitment).toBe(EXPECTED_COMMITMENT);
  });

  it("scales a decimal scalar vote by 10^--decimals (ADR-0025 cross-check)", async () => {
    const res =
      await $`bun run bin/dev.js vote:commit-hash --vote 123.45 --decimals 6 --salt ${SALT_HEX} --juror ${JUROR} --json`.cwd(
        cliRoot,
      );
    const out = JSON.parse(res.stdout.toString());
    expect(out.commitment).toBe(EXPECTED_SCALAR_COMMITMENT);
  });

  it("rejects a decimal scalar vote without matching --decimals", async () => {
    const res =
      await $`bun run bin/dev.js vote:commit-hash --vote 123.45 --salt ${SALT_HEX} --juror ${JUROR}`
        .cwd(cliRoot)
        .nothrow();
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toMatch(/InvalidScalarVote|fraction/i);
  });

  it("rejects an invalid (non-64-hex) salt", async () => {
    const res =
      await $`bun run bin/dev.js vote:commit-hash --vote 1 --salt deadbeef --juror ${JUROR}`
        .cwd(cliRoot)
        .nothrow();
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toMatch(/InvalidSalt|salt/i);
  });
});

describe("useaccord vote:commit", () => {
  it("--help renders usage with --salt-from, --round-idx and --decimals", async () => {
    const { stdout, exitCode } = await help("vote:commit");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--round-idx");
    expect(stdout).toContain("--vote");
    expect(stdout).toContain("--decimals");
    expect(stdout).toContain("--salt");
    expect(stdout).toContain("--salt-from");
  });
});

describe("useaccord vote:reveal", () => {
  it("--help renders usage with --staking-token/--juror-token-account/--vault/--decimals", async () => {
    const { stdout, exitCode } = await help("vote:reveal");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--staking-token");
    expect(stdout).toContain("--juror-token-account");
    expect(stdout).toContain("--vault");
    expect(stdout).toContain("--decimals");
  });
});

describe("useaccord vote:finalize-round", () => {
  it("--help renders usage with --remaining-accounts", async () => {
    const { stdout, exitCode } = await help("vote:finalize-round");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--round-idx");
    expect(stdout).toContain("--remaining-accounts");
  });
});

describe("useaccord vote:finalize-dispute", () => {
  it("--help renders usage with --remaining-accounts", async () => {
    const { stdout, exitCode } = await help("vote:finalize-dispute");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--remaining-accounts");
  });
});

describe("useaccord vote:redraw", () => {
  it("--help renders usage with --fee-token/--filer-token-account/--fee-vault", async () => {
    const { stdout, exitCode } = await help("vote:redraw");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--fee-token");
    expect(stdout).toContain("--filer-token-account");
    expect(stdout).toContain("--fee-vault");
  });
});
