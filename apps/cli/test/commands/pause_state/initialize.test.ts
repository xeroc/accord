import { $ } from "bun";
import { expect, describe, it } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadKeypair } from "../../../src/lib/wallet.js";

/**
 * CLI smoke + wallet-loading tests.
 *
 * The on-chain send is exercised end-to-end against Surfpool manually (see
 * README). These tests cover the deterministic surface: keypair parsing and
 * the oclif command wiring (help renders, flag parsing).
 */

/** Mint a valid 64-byte Solana keypair file (seed ‖ public key). */
function writeTempKeypair(dir: string): string {
  const path = join(dir, "id.json");
  const seed = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(seed);
  const bytes = new Uint8Array(64);
  bytes.set(seed, 0);
  bytes.set(pub, 32);
  writeFileSync(path, JSON.stringify(Array.from(bytes)));
  return path;
}

describe("loadKeypair", () => {
  it("loads a valid 64-byte uint8 keypair file into a signer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "accord-cli-"));
    const path = writeTempKeypair(dir);

    const signer = await loadKeypair(path);
    // Solana base58 addresses are 32–44 chars over the base58 alphabet.
    expect(signer.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a file that is not a 64-byte uint8 array", async () => {
    const dir = mkdtempSync(join(tmpdir(), "accord-cli-"));
    const path = join(dir, "bad.json");
    writeFileSync(path, JSON.stringify([1, 2, 3]));

    await expect(loadKeypair(path)).rejects.toThrow(/64 uint8 bytes/);

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear error on a missing file", async () => {
    await expect(loadKeypair("/nonexistent/path/id.json")).rejects.toThrow(
      /Cannot read wallet keypair/,
    );
  });
});

describe("useaccord pause_state initialize", () => {
  // test/commands/pause_state/ → commands → test → apps/cli
  const cliRoot = import.meta.dir + "/../../..";

  it("--help renders usage with the command summary", async () => {
    const { stdout, exitCode } = await $`bun run bin/dev.js pause_state initialize --help`.cwd(
      cliRoot,
    );
    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("PauseState singleton");
    expect(stdout.toString()).toContain("--wallet");
    expect(stdout.toString()).toContain("ANCHOR_WALLET");
  });

  it("errors clearly when no wallet is provided", async () => {
    const { stderr, exitCode } = await $`bun run bin/dev.js pause_state initialize`
      .cwd(cliRoot)
      .env({ ...process.env, ANCHOR_WALLET: "" })
      .nothrow();
    expect(exitCode).toBe(2);
    expect(stderr.toString()).toContain("wallet");
  });
});
