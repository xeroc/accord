/**
 * `useaccord evidence:register-key --endpoint <url> [--key-out <path>]` —
 * register (or rotate) the invoking juror's Delivery Key at the evidence
 * daemon (ADR-0034). Headless-juror flow: generate or load the X25519 delivery
 * keypair from `--key-out` (default `~/.config/accord/delivery-key.json`), then
 * PUT it under a wallet `signMessage` binding — the `--keypair` wallet (same
 * resolution as every chain command) signs the `accord-delkey-v1` message.
 * Strict delivery: a drawn juror WITHOUT a registered Delivery Key gets 404
 * from `GET /evidence/{dispute}/for/{juror}` — this command is how a headless
 * juror becomes deliverable. Re-running registers the SAME key unless the file
 * changed (idempotent binding, fresh `registered_at`). Rotation = delete (or
 * point `--key-out` at) a new file and re-run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

import { Flags } from "@oclif/core";
import { createKeyPairSignerFromBytes, getBase58Decoder } from "@solana/kit";
import {
  decodeDeliveryKeypair,
  encodeDeliveryKeypair,
  generateDeliveryKey,
  registerDeliveryKey,
  type DeliveryKeypair,
} from "@useaccord/sdk/evidence";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";
import { readKeypairBytes, resolveKeypairPath } from "../../lib/wallet.js";

/** Default delivery-key file (first use generates + persists it here). */
export const DEFAULT_DELIVERY_KEY_PATH = `${homedir()}/.config/accord/delivery-key.json`;

export default class EvidenceRegisterKey extends BaseCommand {
  static summary = "Register this wallet's juror Delivery Key at the evidence daemon (ADR-0034)";

  static description =
    "Generates (or loads) an X25519 Delivery Keypair at --key-out and " +
    "registers its public half at {--endpoint}/jurors/{juror}/delivery-key " +
    "under a signMessage binding from the --keypair wallet. The daemon " +
    "rejects registered_at <= stored (409, replay protection) and " +
    "non-verifying signatures (400). A drawn juror without a registered key " +
    "receives 404 from delivery — run this once per juror per daemon before " +
    "the draw. The delivery secret never leaves the key file.";

  static examples = [
    "<%= config.bin %> evidence:register-key --endpoint http://127.0.0.1:8787",
    "<%= config.bin %> evidence:register-key --endpoint http://127.0.0.1:8787 --key-out ./juror1-delivery.json --keypair ./juror1.json",
  ];

  static flags = {
    ...accordBaseFlags,
    endpoint: Flags.string({
      description: "Evidence-daemon base URL ($ACCORD_DAEMON_URL)",
      env: "ACCORD_DAEMON_URL",
      required: true,
    }),
    "key-out": Flags.string({
      description: `Delivery keypair file (JSON uint8[64], pub‖secret); generated on first use (default ${DEFAULT_DELIVERY_KEY_PATH})`,
    }),
    keypair: Flags.string({
      description:
        "Juror wallet keypair JSON — signs the registration ($ANCHOR_WALLET | $ACCORD_KEYPAIR_PATH)",
      char: "k",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EvidenceRegisterKey);
    this.applyOutput(flags);

    const keyOut = flags["key-out"] ?? DEFAULT_DELIVERY_KEY_PATH;
    const kp = this.loadOrCreateDeliveryKey(keyOut);
    const walletBytes = readKeypairBytes(resolveKeypairPath(flags.keypair));
    const signer = await createKeyPairSignerFromBytes(walletBytes);

    const out = await registerDeliveryKey({
      endpoint: flags.endpoint!,
      juror: signer.address,
      encPub: kp.publicKey,
      signMessage: async (msg) => {
        const [dict] = await signer.signMessages([{ content: msg, signatures: {} }]);
        if (dict === undefined) throw new Error("wallet produced no signature dict");
        const sig = dict[signer.address];
        if (sig === undefined) throw new Error("wallet produced no signature");
        return new Uint8Array(sig);
      },
    });

    const encPubB58 = getBase58Decoder().decode(kp.publicKey);
    this.emitRead(
      {
        juror: signer.address,
        enc_pub: encPubB58,
        registered_at: out.registeredAt,
        key_file: keyOut,
      },
      {
        primary: encPubB58,
        human: [
          `juror        : ${signer.address}`,
          `enc_pub      : ${encPubB58}`,
          `registered_at: ${out.registeredAt}`,
          `key file     : ${keyOut}`,
        ],
      },
    );
  }

  /** Load the delivery keypair from `path`, generating + persisting on first use. */
  private loadOrCreateDeliveryKey(path: string): DeliveryKeypair {
    if (existsSync(path)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, "utf-8"));
      } catch (e) {
        throw new Error(
          `delivery key file "${path}" is not valid JSON (expected a uint8[64] array): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 64 ||
        !parsed.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255)
      ) {
        throw new Error(
          `delivery key file "${path}" must be a JSON array of exactly 64 uint8 bytes (got ${
            Array.isArray(parsed) ? parsed.length : typeof parsed
          }).`,
        );
      }
      return decodeDeliveryKeypair(new Uint8Array(parsed as number[]));
    }
    const kp = generateDeliveryKey();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(Array.from(encodeDeliveryKeypair(kp))), "utf-8");
    return kp;
  }
}
