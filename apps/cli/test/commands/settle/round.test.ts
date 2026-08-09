import { $ } from "bun";
import { expect, describe, it, beforeAll } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// test/commands/settle/ → commands → test → apps/cli
const cliRoot = import.meta.dir + "/../../..";

/**
 * settle:round smoke + offline behavior. On-chain sends against a Final
 * dispute (the full create→draw→vote→appeal→finalize chain) are exercised via
 * the e2e harness (tests/src); here we prove flag wiring + that `--dry-run`
 * builds the settle_round instruction offline in explicit-panel (`list`) mode.
 */

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

// A throwaway Solana keypair (seed‖pubkey, 64 bytes) for the offline --dry-run.
let keypairPath: string;
beforeAll(() => {
  const dir = mkdirSync(join(tmpdir(), `accord-settle-${process.pid}`), { recursive: true });
  const seed = randomBytes(32);
  const publicKey = ed25519.getPublicKey(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed);
  secretKey.set(publicKey, 32);
  keypairPath = join(dir, "id.json");
  writeFileSync(keypairPath, JSON.stringify(Array.from(secretKey)));
});

// Distinct valid 32-byte Solana addresses (dry-run sends nothing on-chain).
const SUBACCORD = "9xQeWvG816bUx9EPa7X8ZyNYBE6yW8zH2XUFmfYqjEEx";
const DISPUTE = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUROR_A = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const JUROR_B = "SysvarRent111111111111111111111111111111111";
const JUROR_C = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed";

describe("useaccord settle:round", () => {
  it("--help renders usage with settle flags", async () => {
    const { stdout, exitCode } = await help("settle:round");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("--dispute");
    expect(stdout).toContain("--round-idx");
    expect(stdout).toContain("--remaining-accounts");
    expect(stdout).toContain("--juror-stake");
  });

  it("errors (non-zero) when a required flag is missing", async () => {
    const res = await $`bun run bin/dev.js settle:round --round-idx 0`.cwd(cliRoot).nothrow();
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.toString()).toMatch(/subaccord|Missing required/i);
  });

  it("builds the instruction offline with --dry-run (list mode)", async () => {
    const res =
      await $`bun run bin/dev.js settle:round --subaccord ${SUBACCORD} --dispute ${DISPUTE} --round-idx 0 --remaining-accounts list --juror-stake ${JUROR_A} --juror-stake ${JUROR_B} --juror-stake ${JUROR_C} --dry-run`
        .cwd(cliRoot)
        .env({ ...process.env, ANCHOR_WALLET: "", ACCORD_KEYPAIR_PATH: keypairPath })
        .nothrow();

    expect(res.exitCode).toBe(0);
    const out = res.stdout.toString();
    expect(out).toContain("[dry-run]");
    expect(out).toContain("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed");
    // The three explicit JurorStake PDAs appear in the instruction accounts.
    expect(out).toContain(JUROR_A);
    expect(out).toContain(JUROR_C);
  });
});
