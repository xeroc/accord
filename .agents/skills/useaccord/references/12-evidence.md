# Evidence — Delivery Keys & juror delivery (ADR-0034)

Juror-bound evidence delivery targets a **Delivery Key**: a browser-held (or,
headless, file-held) X25519 keypair registered at the evidence daemon under a
wallet `signMessage` binding. Delivery is **strict** — a drawn juror WITHOUT a
registered Delivery Key gets `404` from `GET /evidence/{dispute}/for/{juror}`;
there is no Ed→X fallback anywhere in delivery.

Registration message (signed by the juror's Solana wallet, Ed25519):

```
accord-delkey-v1\nregistered_at:{unix-ms}\nenc_pub:{base58}
```

Daemon gates on `PUT /jurors/{juror}/delivery-key`: malformed body / signature
not verifying against `{juror}` ⇒ `400`; `registered_at <= stored` ⇒ `409`
(replay-downgrade protection — a replayed superseded key can never win);
accept ⇒ `201`. Open registration: no staked/drawn requirement. One active key
per juror per daemon, last-writer-wins; rotation = register a new key at a
later `registered_at`, then re-pull (nothing stored is keyed — delivery
re-encrypts per request).

## Commands

```bash
# Register (or re-register) this wallet's juror Delivery Key — headless juror
useaccord evidence:register-key --endpoint http://127.0.0.1:8787

# explicit delivery-key file + juror wallet
useaccord evidence:register-key --endpoint http://127.0.0.1:8787 \
  --key-out ./juror1-delivery.json --keypair ./juror1.json

# env fallback for --endpoint
ACCORD_DAEMON_URL=https://daemon.example.com useaccord evidence:register-key
```

First run generates a fresh X25519 delivery keypair at `--key-out` (default
`~/.config/accord/delivery-key.json`, JSON `uint8[64]` = `pub(32)‖secret(32)`)
and persists it BEFORE registering; later runs load the same key (stable
binding, fresh `registered_at`). Rotation: point `--key-out` at a new file (or
delete it) and re-run. The delivery secret never leaves the key file.

## Flags

| Flag           | Env                 | Description                                                        |
| -------------- | ------------------- | ------------------------------------------------------------------ |
| `--endpoint`   | `ACCORD_DAEMON_URL` | Evidence-daemon base URL (required: flag or env)                   |
| `--key-out`    | —                   | Delivery keypair file; generated on first use                      |
| `--keypair`/`-k` | `ANCHOR_WALLET` \| `ACCORD_KEYPAIR_PATH` | Juror wallet that signs the registration (default `~/.config/solana/id.json`) |
| `--json`       | —                   | Single JSON object on stdout (`juror`, `enc_pub`, `registered_at`, `key_file`) |
| `--quiet`/`-q` | —                   | `enc_pub` (base58) only                                            |

Online (HTTP only — no chain access): the command PUTs via the SDK and prints
the registered `enc_pub`. `409` means a LATER registration already exists
(e.g. another origin rotated first) — self-heal is exactly this command
re-run once the clock passes the stored ts.

## Semantics

- Wallet `signMessage` == the `--keypair` wallet's Ed25519 signature over the
  `accord-delkey-v1` message (SDK `buildDeliveryKeyMessage`).
- The daemon verifies with the SDK-shared `verifyDeliveryKeyRegistration`
  (`@useaccord/sdk/evidence`), then stores `{enc_pub, registered_at}` under
  `juror-keys/{juror}`.
- Delivery (`GET /evidence/{dispute}/for/{juror}`) re-encrypts every round's
  package to the registered `enc_pub` (HKDF label `accord-deliver-v1`); the
  juror decrypts with the Delivery Key secret (SDK `jurorDecryptDelivery`)
  and verifies `sha256(cleartext) == evidence_hash`.
- Stale-key self-heal (another origin re-registered): `GET
  /jurors/{juror}/delivery-key`, compare with the local `enc_pub`, mismatch ⇒
  re-register + re-pull — SDK `ensureRegisteredDeliveryKey` does the compare +
  one `signMessage` re-register.

## SDK functions

| CLI command               | SDK fn (`@useaccord/sdk/evidence`)                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| `evidence:register-key`   | `generateDeliveryKey`, `encode`/`decodeDeliveryKeypair`, `registerDeliveryKey` |
| (client self-heal)        | `getRegisteredDeliveryKey`, `ensureRegisteredDeliveryKey`, `fetchDelivery`, `jurorDecryptDelivery` |
