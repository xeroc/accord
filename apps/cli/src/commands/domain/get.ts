/**
 * `useaccord domain:get <hash>` — fetch a domain doc from the daemon CAS,
 * re-hash verify, print (SDK `fetchDomainDoc`: GET → `sha256(bytes) === hash`
 * → parse optional frontmatter). Human mode prints metadata then the body
 * verbatim; `--quiet` prints only the body.
 */
import { Args, Flags } from "@oclif/core";

import { fetchDomainDoc } from "@useaccord/sdk";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";

export default class DomainGet extends BaseCommand {
  static summary = "Fetch + verify + print a domain doc from the daemon CAS";

  static description =
    "GETs {--daemon-url}/domains/{hash} via SDK fetchDomainDoc, which throws " +
    "unless sha256(bytes) === hash. Prints metadata (hash, content-type, " +
    "frontmatter title/description/version when present) then the body. " +
    "Unknown hash ⇒ 404 error, exit 1.";

  static examples = [
    "<%= config.bin %> domain:get <hash> --daemon-url http://127.0.0.1:3000",
    "<%= config.bin %> domain:get <hash> --quiet > rules.md",
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
    hash: Args.string({ description: "64-hex sha256 of the doc", required: true }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(DomainGet);
    this.applyOutput(flags);

    const hash = args.hash!.toLowerCase();
    const { contentType, doc } = await fetchDomainDoc(flags["daemon-url"]!, hash);

    const human = [`hash   : ${hash}`, `type   : ${contentType}`];
    if (doc.title) human.push(`title  : ${doc.title}`);
    if (doc.description) human.push(`descr  : ${doc.description}`);
    if (doc.version !== undefined) human.push(`version: ${doc.version}`);

    this.emitRead(
      { hash, contentType, ...doc },
      { primary: doc.body, human: [...human, "", doc.body] },
    );
  }
}
