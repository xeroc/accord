import { $ } from "bun";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, describe, it, afterAll } from "bun:test";

import { hashDomainDoc } from "@useaccord/sdk";

// test/commands/domain/ → commands → test → apps/cli (3 levels up)
const cliRoot = import.meta.dir + "/../../..";

async function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await $`bun run bin/dev.js ${args}`
    .cwd(cliRoot)
    .env({ ...process.env, ...env })
    .nothrow();
  return { stdout: res.stdout.toString(), stderr: res.stderr.toString(), exitCode: res.exitCode };
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

const DOC =
  "---\ntitle: Test Rules\ndescription: fixture doc\nversion: 2\n---\n\n# Rules\n\nBe honest.\n";

// Anchor fixture (ADR-0027 amendment): subaccord → domain_ref. The stub
// daemon enforces the chain gate — ?subaccord required, domain_ref == hash.
const SUB = "SubACC0rd1111111111111111111111111111111111";
const anchors = new Map<string, string>([[SUB, ""]]); // hash filled below

// Minimal CAS mirroring the daemon's domain contract (ADR-0027 as amended):
// PUT requires ?subaccord=<addr> whose anchored domain_ref == route hash;
// 201/200/400/409/404, GET 404/200 + stored Content-Type (GET ungated).
const store = new Map<string, { bytes: Uint8Array; contentType: string }>();
const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const url = new URL(req.url);
    const hash = url.pathname.match(/^\/domains\/([0-9a-f]{64})$/)?.[1];
    if (!hash) {
      return Response.json({ error: "hash must be 64-char lowercase hex" }, { status: 400 });
    }
    if (req.method === "PUT") {
      const sub = url.searchParams.get("subaccord");
      if (!sub) {
        return Response.json({ error: "subaccord query parameter required" }, { status: 400 });
      }
      const anchorRef = anchors.get(sub);
      if (anchorRef === undefined) {
        return Response.json({ error: "anchor subaccord not found" }, { status: 404 });
      }
      if (anchorRef !== hash) {
        return Response.json(
          { error: "anchor subaccord domain_ref does not match route hash" },
          { status: 400 },
        );
      }
      const bytes = new Uint8Array(await req.arrayBuffer());
      const existing = store.get(hash);
      if (existing) {
        return existing.bytes.length === bytes.length &&
          existing.bytes.every((b, i) => b === bytes[i])
          ? new Response(null, { status: 200 })
          : Response.json({ error: "content hash collision" }, { status: 409 });
      }
      if (hashDomainDoc(bytes) !== hash) {
        return Response.json({ error: "body hash mismatch" }, { status: 400 });
      }
      store.set(hash, { bytes, contentType: req.headers.get("content-type") ?? "text/markdown" });
      return new Response(null, { status: 201, headers: { Location: `/domains/${hash}` } });
    }
    const hit = store.get(hash);
    if (!hit) return Response.json({ error: "not found" }, { status: 404 });
    return new Response(hit.bytes, {
      headers: { "content-type": hit.contentType, ETag: hash, "Cache-Control": "immutable" },
    });
  },
});
const daemonUrl = `http://localhost:${server.port}`;

const tmpDir = mkdtempSync(join(tmpdir(), "accord-domain-"));
const docFile = join(tmpDir, "rules.md");
writeFileSync(docFile, DOC);
const docHash = hashDomainDoc(new TextEncoder().encode(DOC));
anchors.set(SUB, docHash);

afterAll(() => {
  server.stop(true);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("useaccord domain:* — help smoke", () => {
  it("domain:put --help", async () => {
    const { stdout, exitCode } = await help("domain:put");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--daemon-url");
    expect(stdout).toContain("--subaccord");
    expect(stdout).toContain("ACCORD_DAEMON_URL");
  });

  it("domain:get --help", async () => {
    const { stdout, exitCode } = await help("domain:get");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--daemon-url");
    expect(stdout).toContain("ACCORD_DAEMON_URL");
  });
});

describe("useaccord domain:put", () => {
  it("publishes the file and prints its sha256 (--json)", async () => {
    const out = await runJson<{ hash: string; status: string }>([
      "domain:put",
      docFile,
      "--subaccord",
      SUB,
      "--daemon-url",
      daemonUrl,
      "--json",
    ]);
    expect(out.hash).toBe(docHash);
    expect(out.status).toBe("created");
  });

  it("human mode reports the 200 no-op on identical bytes", async () => {
    const { stdout, exitCode } = await run([
      "domain:put",
      docFile,
      "--subaccord",
      SUB,
      "--daemon-url",
      daemonUrl,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`hash   : ${docHash}`);
    expect(stdout).toContain("already published");
  });

  it("--quiet emits only the hash", async () => {
    const { stdout, exitCode } = await run([
      "domain:put",
      docFile,
      "--subaccord",
      SUB,
      "--daemon-url",
      daemonUrl,
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(docHash);
  });

  it("honors ACCORD_DAEMON_URL env fallback", async () => {
    const { stdout, exitCode } = await run(["domain:put", docFile, "--subaccord", SUB, "--json"], {
      ACCORD_DAEMON_URL: daemonUrl,
    });
    expect(exitCode, stdout).toBe(0);
    expect(JSON.parse(stdout).hash).toBe(docHash);
  });

  it("requires --subaccord (missing flag is a usage error)", async () => {
    const { exitCode, stderr } = await run(["domain:put", docFile, "--daemon-url", daemonUrl]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/subaccord/i);
  });

  it("errors on 404 (anchor Subaccord not on chain)", async () => {
    const { exitCode, stderr } = await run([
      "domain:put",
      docFile,
      "--subaccord",
      "Unkn0wnAddr111111111111111111111111111111111",
      "--daemon-url",
      daemonUrl,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/404|anchor/i);
  });

  it("errors on 400 (anchor domain_ref mismatch)", async () => {
    anchors.set(SUB, "ab".repeat(32)); // anchor points at a different doc
    const { exitCode, stderr } = await run([
      "domain:put",
      docFile,
      "--subaccord",
      SUB,
      "--daemon-url",
      daemonUrl,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/400|domain_ref/i);
    anchors.set(SUB, docHash);
  });

  it("errors on 409 (different bytes at the same hash)", async () => {
    store.set(docHash, {
      bytes: new TextEncoder().encode("imposter"),
      contentType: "text/markdown",
    });
    const { exitCode, stderr } = await run([
      "domain:put",
      docFile,
      "--subaccord",
      SUB,
      "--daemon-url",
      daemonUrl,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/409|collision/i);
  });
});

describe("useaccord domain:get", () => {
  it("fetches, verifies, and prints metadata + body (--json)", async () => {
    store.set(docHash, { bytes: new TextEncoder().encode(DOC), contentType: "text/markdown" });
    const out = await runJson<{
      hash: string;
      contentType: string;
      title?: string;
      body: string;
    }>(["domain:get", docHash, "--daemon-url", daemonUrl, "--json"]);
    expect(out.hash).toBe(docHash);
    expect(out.contentType).toBe("text/markdown");
    expect(out.title).toBe("Test Rules");
    expect(out.body).toContain("Be honest.");
    // version was dropped from the convention (ADR-0027 amendment) — the
    // legacy frontmatter key must not surface in the output.
    expect("version" in out && out.version !== undefined).toBe(false);
  });

  it("human mode prints title line and the body", async () => {
    const { stdout, exitCode } = await run(["domain:get", docHash, "--daemon-url", daemonUrl]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("title  : Test Rules");
    expect(stdout).toContain("Be honest.");
  });

  it("--quiet emits only the body", async () => {
    const { stdout, exitCode } = await run([
      "domain:get",
      docHash,
      "--daemon-url",
      daemonUrl,
      "--quiet",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("# Rules\n\nBe honest.");
  });

  it("errors clearly on an unknown hash (404)", async () => {
    const { exitCode, stderr } = await run([
      "domain:get",
      "0".repeat(64),
      "--daemon-url",
      daemonUrl,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/404/);
  });
});
