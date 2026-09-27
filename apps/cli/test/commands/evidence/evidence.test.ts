// evidence.test.ts — `evidence:register-key` against a verifying stub daemon
// (ADR-0034). The stub mirrors the daemon's registration contract exactly:
// sig must verify against the path juror (else 400), registered_at must be
// strictly greater than the stored one (else 409), accept ⇒ 201.
import { $ } from "bun";
import { ed25519 } from "@noble/curves/ed25519";
import { expect, describe, it, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildDeliveryKeyMessage, verifyDeliveryKeyRegistration } from "@useaccord/sdk/evidence";
import { getBase58Decoder, getBase58Encoder } from "@solana/kit";

// test/commands/evidence/ → commands → test → apps/cli (3 levels up)
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

// -- fixtures -----------------------------------------------------------------

/** Fresh juror wallet (Solana keypair JSON: seed(32) ‖ pub(32)). */
const tmp = mkdtempSync(join(tmpdir(), "evidence-cli-"));
const walletPath = join(tmp, "juror.json");
const walletSeed = ed25519.utils.randomPrivateKey();
const walletPub = ed25519.getPublicKey(walletSeed);
writeFileSync(walletPath, JSON.stringify([...new Uint8Array([...walletSeed, ...walletPub])]));

/** Registered state the stub serves (mutable across runs). */
const registered = new Map<string, { encPub: string; registeredAt: number }>();
let lastPutVerified = false;

const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const url = new URL(req.url);
    const juror = url.pathname.match(/^\/jurors\/([^/]+)\/delivery-key$/)?.[1];
    if (juror === undefined || req.method !== "PUT") {
      return new Response(null, { status: 404 });
    }
    const body = (await req.json()) as {
      enc_pub?: string;
      registered_at?: number;
      sig?: string;
    };
    const jurorBytes = new Uint8Array(getBase58Encoder().encode(juror));
    const encPub = new Uint8Array(Buffer.from(body.enc_pub ?? "", "base64"));
    const sig = new Uint8Array(Buffer.from(body.sig ?? "", "base64"));
    lastPutVerified = verifyDeliveryKeyRegistration(
      jurorBytes,
      encPub,
      body.registered_at ?? -1,
      sig,
    );
    if (!lastPutVerified) {
      return Response.json({ error: "signature does not verify" }, { status: 400 });
    }
    const stored = registered.get(juror);
    if (stored !== undefined && (body.registered_at ?? 0) <= stored.registeredAt) {
      return Response.json({ error: "stale registered_at" }, { status: 409 });
    }
    registered.set(juror, {
      encPub: body.enc_pub ?? "",
      registeredAt: body.registered_at ?? 0,
    });
    return new Response(null, { status: 201 });
  },
});

const keyOut = join(tmp, "delivery-key.json");

afterAll(() => {
  server.stop(true);
  rmSync(tmp, { recursive: true, force: true });
});

// -- tests --------------------------------------------------------------------

describe("evidence:register-key", () => {
  it("--help exits 0 and documents the command", async () => {
    const res = await $`bun run bin/dev.js evidence:register-key --help`.cwd(cliRoot);
    expect(res.exitCode).toBe(0);
    expect(res.stdout.toString()).toContain("register-key");
  });

  it("generates the delivery key file, registers sig-valid, prints juror + enc_pub", async () => {
    const { stdout, exitCode } = await run([
      "evidence:register-key",
      "--json",
      "--endpoint",
      `http://127.0.0.1:${server.port}`,
      "--key-out",
      keyOut,
      "--keypair",
      walletPath,
    ]);
    expect(exitCode, `expected clean exit: ${stdout}`).toBe(0);
    const out = JSON.parse(stdout) as { juror: string; enc_pub: string; registered_at: number };
    expect(out.juror).toBe(getBase58Decoder().decode(walletPub));
    expect(lastPutVerified).toBe(true);

    // key file created: JSON uint8[64], pub(32)‖secret(32), pub == enc_pub
    const stored = JSON.parse(readFileSync(keyOut, "utf-8")) as number[];
    expect(stored.length).toBe(64);
    expect(Buffer.from(stored.slice(0, 32)).toString("base64")).toBeDefined();
  });

  it("re-run loads the SAME key (no regeneration) and registers it again", async () => {
    const before = JSON.parse(readFileSync(keyOut, "utf-8")) as number[];
    await new Promise((r) => setTimeout(r, 5)); // ensure registered_at ticks up
    const { stdout, exitCode } = await run([
      "evidence:register-key",
      "--json",
      "--endpoint",
      `http://127.0.0.1:${server.port}`,
      "--key-out",
      keyOut,
      "--keypair",
      walletPath,
    ]);
    expect(exitCode, `expected clean exit: ${stdout}`).toBe(0);
    const after = JSON.parse(readFileSync(keyOut, "utf-8")) as number[];
    expect(after).toEqual(before);
    const out = JSON.parse(stdout) as { enc_pub: string };
    expect(out.enc_pub).toBe(getBase58Decoder().decode(new Uint8Array(before.slice(0, 32))));
  });

  it("daemon 409 (stale registered_at) exits non-zero with the status surfaced", async () => {
    // Pre-seed a FUTURE registration so the CLI's Date.now() stamp is stale.
    const jurorB58 = getBase58Decoder().decode(walletPub);
    const encPub = new Uint8Array(32).fill(7);
    const ts = Date.now() + 60_000;
    const sig = ed25519.sign(buildDeliveryKeyMessage(encPub, ts), walletSeed);
    registered.set(jurorB58, {
      encPub: Buffer.from(encPub).toString("base64"),
      registeredAt: ts,
    });
    expect(verifyDeliveryKeyRegistration(walletPub, encPub, ts, sig)).toBe(true); // stub-state sanity

    const { stderr, exitCode } = await run([
      "evidence:register-key",
      "--json",
      "--endpoint",
      `http://127.0.0.1:${server.port}`,
      "--key-out",
      keyOut,
      "--keypair",
      walletPath,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("409");
  });
});
