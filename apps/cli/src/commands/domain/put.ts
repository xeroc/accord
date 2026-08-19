/**
 * `useaccord domain:put <file>` — publish a domain rules doc to the evidence
 * daemon's public CAS (ADR-0027). Hashes locally (SDK `hashDomainDoc` — never
 * hand-rolled), PUTs the raw bytes to `/domains/{hash}`, prints the hash.
 *
 * Doc-first flow: the upload legally precedes `create_list` / `create_subaccord`
 * with `rules_hash` / `domain_ref` = the printed hash. Idempotent: identical
 * bytes at a stored hash are a 200 no-op; different bytes are a 409 (the CAS
 * never overwrites).
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { Args, Flags } from "@oclif/core";

import { hashDomainDoc } from "@useaccord/sdk";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";

export default class DomainPut extends BaseCommand {
  static summary = "Publish a domain rules doc to the daemon CAS; prints its sha256";

  static description =
    "Reads <file> as raw bytes, hashes with SDK hashDomainDoc, and PUTs to " +
    "{--daemon-url}/domains/{hash}. 201 = published, 200 = identical bytes " +
    "already stored (no-op), 409 = different bytes at that hash (never " +
    "overwritten). Content-Type: text/markdown for .md/.markdown, otherwise " +
    "application/octet-stream.";

  static examples = [
    "<%= config.bin %> domain:put rules.md --daemon-url http://127.0.0.1:3000",
    "ACCORD_DAEMON_URL=https://daemon.example.com <%= config.bin %> domain:put rules.md",
  ];

  static flags = {
    ...accordBaseFlags,
    "daemon-url": Flags.string({
      description: "Evidence-daemon base URL ($ACCORD_DAEMON_URL)",
      env: "ACCORD_DAEMON_URL",
      required: true,
    }),
  };

  static args = {
    file: Args.string({
      description: "Path to the rules doc (raw bytes are hashed)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(DomainPut);
    this.applyOutput(flags);

    const file = args.file!;
    const bytes = new Uint8Array(readFileSync(file));
    const hash = hashDomainDoc(bytes);

    const res = await fetch(`${flags["daemon-url"]!.replace(/\/+$/, "")}/domains/${hash}`, {
      method: "PUT",
      headers: { "content-type": contentTypeFor(file) },
      body: bytes,
    });

    if (res.status !== 200 && res.status !== 201) {
      const detail = await res
        .json()
        .then((b: unknown) => (b as { error?: string }).error)
        .catch(() => undefined);
      this.error(
        `PUT /domains/${hash} failed: ${res.status}${detail ? ` ${detail}` : ""}` +
          (res.status === 409
            ? " — different bytes are already stored at this hash; the CAS never overwrites"
            : ""),
        { exit: 1 },
      );
    }

    const created = res.status === 201;
    this.emitRead(
      { hash, status: created ? "created" : "already-published" },
      {
        primary: hash,
        human: [
          `hash   : ${hash}`,
          created
            ? "status : published (201)"
            : "status : already published — identical bytes (200 no-op)",
        ],
      },
    );
  }
}

/** Presentation-only header pick; the daemon stays format-blind. */
function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  return ext === ".md" || ext === ".markdown" ? "text/markdown" : "application/octet-stream";
}
