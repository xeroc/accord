import { $ } from "bun";
import { expect, describe, it } from "bun:test";

const cliRoot = import.meta.dir + "/../../..";

describe("useaccord dispute:show", () => {
  it("--help renders usage with the dispute arg + chain flags", async () => {
    const res = await $`bun run bin/dev.js dispute:show --help`.cwd(cliRoot);
    const stdout = res.stdout.toString();
    expect(res.exitCode).toBe(0);
    expect(stdout).toContain("--rpc");
    expect(stdout).toContain("DISPUTE");
  });

  it("requires the dispute argument", async () => {
    const res = await $`bun run bin/dev.js dispute:show`
      .cwd(cliRoot)
      .env({ ...process.env, ACCORD_RPC_URL: "http://127.0.0.1:8899" })
      .nothrow();
    expect(res.exitCode).not.toBe(0);
  });
});
