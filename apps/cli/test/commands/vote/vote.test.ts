import { $ } from "bun";
import { expect, describe, it } from "bun:test";

// test/commands/vote/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

// Known cross-check vector: the SDK's commitHash for (vote=1, salt=0x01*32,
// juror=PROGRAM_ID), computed independently. The CLI's `vote:commit-hash` must
// emit exactly this — proving the pure command matches the on-chain hashv.
const SALT_HEX = "01".repeat(32);
const JUROR = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed";
const EXPECTED_COMMITMENT = "c70c38e63a30261d5bb5dcac7257a4f7169ab35a959968d3ec1c0f2ad314392e";

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
  it("--help renders usage with --vote/--salt/--juror", async () => {
    const { stdout, exitCode } = await help("vote:commit-hash");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--vote");
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
  it("--help renders usage with --salt-from and --round-idx", async () => {
    const { stdout, exitCode } = await help("vote:commit");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--round-idx");
    expect(stdout).toContain("--vote");
    expect(stdout).toContain("--salt");
    expect(stdout).toContain("--salt-from");
  });
});

describe("useaccord vote:reveal", () => {
  it("--help renders usage with --staking-token/--juror-token-account/--vault", async () => {
    const { stdout, exitCode } = await help("vote:reveal");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--staking-token");
    expect(stdout).toContain("--juror-token-account");
    expect(stdout).toContain("--vault");
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
