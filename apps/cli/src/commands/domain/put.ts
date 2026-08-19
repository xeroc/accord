/**
 * `useaccord domain:put <file> --subaccord <addr>` — publish a domain rules
 * doc to the evidence daemon's public CAS (ADR-0027 as amended). Delegates to
 * SDK `putDomainDoc` (the single publish implementation): hash locally, PUT
 * to `/domains/{hash}?subaccord=<addr>`, print the hash.
 *
 * Create-first flow: the anchor Subaccord must already exist on-chain with
 * `domain_ref = sha256(doc)` — publish happens after the create-tx confirms.
 * Idempotent: identical bytes at a stored hash are a 200 no-op; different
 * bytes are a 409 (the CAS never overwrites).
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { Args, Flags } from "@oclif/core";

import { DomainPublishError, putDomainDoc } from "@useaccord/sdk";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";

export default class DomainPut extends BaseCommand {
  static summary = "Publish a domain rules doc to the daemon CAS; prints its sha256";

  static description =
    "Reads <file> as raw bytes and publishes via SDK putDomainDoc to " +
    "{--daemon-url}/domains/{hash}?subaccord={--subaccord}. The anchor " +
    "Subaccord must already exist on-chain with domain_ref = sha256(doc) " +
    "(create-first). 201 = published, 200 = identical bytes already stored " +
    "(no-op), 404 = anchor not found (create-tx unconfirmed or wrong " +
    "address), 400 = anchor domain_ref mismatch / bad hash, 409 = different " +
    "bytes at that hash (never overwritten). Content-Type: text/markdown " +
    "for .md/.markdown, otherwise application/octet-stream.";

  static examples = [
    "<%= config.bin %> domain:put rules.md --subaccord SuB… --daemon-url http://127.0.0.1:3000",
    "ACCORD_DAEMON_URL=https://daemon.example.com <%= config.bin %> domain:put rules.md --subaccord SuB…",
  ];

  static flags = {
    ...accordBaseFlags,
    "daemon-url": Flags.string({
      description: "Evidence-daemon base URL ($ACCORD_DAEMON_URL)",
      env: "ACCORD_DAEMON_URL",
      required: true,
    }),
    subaccord: Flags.string({
      description:
        "Anchor Subaccord address — the daemon verifies its on-chain domain_ref equals the doc hash",
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

    let out;
    try {
      out = await putDomainDoc(flags["daemon-url"]!, bytes, {
        subaccord: flags.subaccord!,
        contentType: contentTypeFor(file),
      });
    } catch (e) {
      if (e instanceof DomainPublishError) {
        this.error(publishErrorMessage(e), { exit: 1 });
      }
      throw e;
    }

    const created = out.status === 201;
    this.emitRead(
      { hash: out.hash, status: created ? "created" : "already-published" },
      {
        primary: out.hash,
        human: [
          `hash   : ${out.hash}`,
          created
            ? "status : published (201)"
            : "status : already published — identical bytes (200 no-op)",
        ],
      },
    );
  }
}

/** Human hints per daemon rejection status (ADR-0027 amendment semantics). */
function publishErrorMessage(e: DomainPublishError): string {
  const detail = e.body.trim();
  const base = `PUT /domains/{hash} failed: ${e.status}${detail ? ` ${detail}` : ""}`;
  switch (e.status) {
    case 404:
      return (
        `${base} — anchor Subaccord not found: create the Subaccord with ` +
        `domain_ref = sha256(doc) first and wait for the create-tx to confirm`
      );
    case 400:
      return (
        `${base} — the anchor's on-chain domain_ref does not match this ` +
        `doc's hash (or the body hash is wrong); re-check --subaccord and the file`
      );
    case 409:
      return `${base} — different bytes are already stored at this hash; the CAS never overwrites`;
    default:
      return base;
  }
}

/** Presentation-only header pick; the daemon stays format-blind. */
function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  return ext === ".md" || ext === ".markdown" ? "text/markdown" : "application/octet-stream";
}
