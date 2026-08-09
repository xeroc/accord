import { $ } from "bun";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, describe, it, beforeAll, afterAll } from "bun:test";

// test/commands/accumulator/ → commands → test → apps/cli (3 levels up)
const cliRoot = import.meta.dir + "/../../..";

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${args}`.cwd(cliRoot).nothrow();
  return {
    stdout: res.stdout.toString(),
    stderr: res.stderr.toString(),
    exitCode: res.exitCode,
  };
}

async function runJson<T>(args: string[]): Promise<T> {
  const { stdout, exitCode } = await run(args);
  expect(exitCode, `expected clean exit: ${stdout}`).toBe(0);
  return JSON.parse(stdout) as T;
}

async function help(topic: string): Promise<{ stdout: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${topic} --help`.cwd(cliRoot);
  return { stdout: res.stdout.toString(), exitCode: res.exitCode };
}

// Three stakers at REAL valid Solana addresses (Token/ComputeBudget/Stake
// programs — guaranteed valid base58 32-byte decodes), stakes 1000/2000/3000.
const LEAVES = [
  { juror: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", stake: "1000" },
  { juror: "ComputeBudget111111111111111111111111111111", stake: "2000" },
  { juror: "Stake11111111111111111111111111111111111111", stake: "3000" },
];

// Byte-exact regression vectors (stable; canonical SDK mst.ts is the reference).
const DEPTH2_ROOT = "bf32417f21d7efcaa25d769df144315ba483b54f6f9531155844ff9619c696b8";
const DEPTH2_ROOTSUM = "6000";
const EMPTY_DEPTH1 = "5aee3a4cefe975a7f561e7811e5c3fea956d884f49a406acda146966c6b8cadc";

let tmpDir: string;
let leavesFile: string;
let proofFile: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "accord-acc-"));
  leavesFile = join(tmpDir, "leaves.json");
  proofFile = join(tmpDir, "proof.json");
  writeFileSync(leavesFile, JSON.stringify(LEAVES));
  // Generate the index-1 proof file once, up front, so the verify tests don't
  // depend on test ordering.
  const { stdout, exitCode } = await run([
    "accumulator:proof",
    "--leaves",
    leavesFile,
    "--depth",
    "2",
    "--index",
    "1",
    "--json",
  ]);
  expect(exitCode, `proof generation failed: ${stdout}`).toBe(0);
  writeFileSync(proofFile, stdout);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("useaccord accumulator:* — help smoke", () => {
  it("accumulator:build --help", async () => {
    const { stdout, exitCode } = await help("accumulator:build");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--leaves");
    expect(stdout).toContain("--depth");
  });

  it("accumulator:proof --help", async () => {
    const { stdout, exitCode } = await help("accumulator:proof");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--index");
  });

  it("accumulator:empty-root --help", async () => {
    const { stdout, exitCode } = await help("accumulator:empty-root");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--depth");
  });

  it("accumulator:verify --help", async () => {
    const { stdout, exitCode } = await help("accumulator:verify");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--root");
    expect(stdout).toContain("--root-sum");
  });

  it("accumulator:prepare-stake-proof --help", async () => {
    const { stdout, exitCode } = await help("accumulator:prepare-stake-proof");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("--juror");
    // reads chain → carries the chain flags
    expect(stdout).toContain("--rpc");
    expect(stdout).toContain("--keypair");
  });
});

describe("useaccord accumulator:build", () => {
  it("computes the byte-exact root for a known stake set", async () => {
    const out = await runJson<{
      rootHash: string;
      rootSum: string;
      depth: number;
      leafCount: number;
    }>(["accumulator:build", "--leaves", leavesFile, "--depth", "2", "--json"]);
    expect(out.rootHash).toBe(DEPTH2_ROOT);
    expect(out.rootSum).toBe(DEPTH2_ROOTSUM);
    expect(out.depth).toBe(2);
    expect(out.leafCount).toBe(3);
  });

  it("human mode prints a rootHash line", async () => {
    const { stdout, exitCode } = await run([
      "accumulator:build",
      "--leaves",
      leavesFile,
      "--depth",
      "2",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("rootHash  :");
    expect(stdout).toContain(DEPTH2_ROOT);
  });

  it("--quiet emits only the root hash", async () => {
    const { stdout, exitCode } = await run([
      "accumulator:build",
      "--leaves",
      leavesFile,
      "--depth",
      "2",
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(DEPTH2_ROOT);
  });

  it("errors clearly on a missing leaves file", async () => {
    const { exitCode, stderr } = await run([
      "accumulator:build",
      "--leaves",
      join(tmpDir, "nope.json"),
      "--depth",
      "2",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Cannot read file|No such|Error/i);
  });
});

describe("useaccord accumulator:empty-root", () => {
  it("returns the byte-exact empty root at depth 1", async () => {
    const out = await runJson<{ rootHash: string; depth: number }>([
      "accumulator:empty-root",
      "--depth",
      "1",
      "--json",
    ]);
    expect(out.rootHash).toBe(EMPTY_DEPTH1);
    expect(out.depth).toBe(1);
  });

  it("matches a build of an all-zero tree (consistency)", async () => {
    const empty = join(tmpDir, "empty.json");
    writeFileSync(empty, "[]");
    const built = await runJson<{ rootHash: string }>([
      "accumulator:build",
      "--leaves",
      empty,
      "--depth",
      "3",
      "--json",
    ]);
    const emptyRoot = await runJson<{ rootHash: string }>([
      "accumulator:empty-root",
      "--depth",
      "3",
      "--json",
    ]);
    expect(built.rootHash).toBe(emptyRoot.rootHash);
  });
});

describe("useaccord accumulator:proof", () => {
  it("emits the v1 proof-file schema with a path of length = depth", async () => {
    const out = await runJson<{
      version: number;
      index: number;
      path: { siblingHash: string; siblingSum: string }[];
    }>(["accumulator:proof", "--leaves", leavesFile, "--depth", "2", "--index", "1", "--json"]);
    expect(out.version).toBe(1);
    expect(out.index).toBe(1);
    expect(out.path).toHaveLength(2); // depth 2 → 2-level path
    for (const node of out.path) {
      expect(node.siblingHash).toMatch(/^[0-9a-f]{64}$/);
      expect(node.siblingSum).toMatch(/^\d+$/);
    }
  });
});

describe("useaccord accumulator:verify", () => {
  it("verifies a correct leaf+path and returns the sortition prefix", async () => {
    const out = await runJson<{ ok: boolean; prefix: string }>([
      "accumulator:verify",
      "--leaf",
      '{"juror":"ComputeBudget111111111111111111111111111111","stake":"2000"}',
      "--index",
      "1",
      "--path",
      proofFile,
      "--root",
      DEPTH2_ROOT,
      "--root-sum",
      DEPTH2_ROOTSUM,
      "--json",
    ]);
    // leaf 0 has stake 1000 → leaf 1's cumulative-from-left prefix is 1000.
    expect(out.ok).toBe(true);
    expect(out.prefix).toBe("1000");
  });

  it("rejects a tampered root (ok=false)", async () => {
    const badRoot = "f".repeat(64);
    const out = await runJson<{ ok: boolean }>([
      "accumulator:verify",
      "--leaf",
      '{"juror":"ComputeBudget111111111111111111111111111111","stake":"2000"}',
      "--index",
      "1",
      "--path",
      proofFile,
      "--root",
      badRoot,
      "--root-sum",
      DEPTH2_ROOTSUM,
      "--json",
    ]);
    expect(out.ok).toBe(false);
  });

  it("rejects a wrong stake in the leaf", async () => {
    const out = await runJson<{ ok: boolean }>([
      "accumulator:verify",
      "--leaf",
      '{"juror":"ComputeBudget111111111111111111111111111111","stake":"9999"}',
      "--index",
      "1",
      "--path",
      proofFile,
      "--root",
      DEPTH2_ROOT,
      "--root-sum",
      DEPTH2_ROOTSUM,
      "--json",
    ]);
    expect(out.ok).toBe(false);
  });
});

describe("useaccord accumulator:prepare-stake-proof (chain)", () => {
  // No Surfpool in this epic; verify the command surfaces a clean RPC error
  // against a dead endpoint (proves the chain path is wired, not a pure stub).
  it("errors cleanly when the rpc is unreachable", async () => {
    const { exitCode, stderr } = await run([
      "accumulator:prepare-stake-proof",
      "--rpc",
      "http://127.0.0.1:1", // closed port → connection refused
      "--subaccord",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "--juror",
      "ComputeBudget111111111111111111111111111111",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/RpcUnreachable|fetch|ECONN|wallet|keypair|Error|connect/i);
  });
});
