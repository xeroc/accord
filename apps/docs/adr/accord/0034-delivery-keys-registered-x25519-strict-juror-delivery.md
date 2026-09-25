# Delivery Keys — registered X25519 keys for juror delivery; strict mode drops juror-side dual-use (amends 0015, 0011)

Browser wallets expose `signMessage` / `signTransaction` only — no private-key
export, no ECDH operation — so ADR-0015's dual-use delivery (encrypt to the
Montgomery form of the juror's Ed25519 key, decrypt with the converted seed)
cannot run in a browser: the wallet will never hand over the secret the ECIES
decrypt needs. Jurors therefore register a **Delivery Key**: a browser-generated
noble X25519 keypair (raw secret persisted in origin-scoped IndexedDB) whose
public half is registered at the evidence daemon under a wallet signature
binding it to the juror's pubkey. Delivery is **strict**: no registered
Delivery Key ⇒ `404`. One active Delivery Key per juror per daemon,
last-writer-wins; rotation is re-register + re-pull (delivery re-encrypts per
request, so nothing stored ever needs re-keying).

## Considered Options

- **Binding — off-chain registration at the daemon (chosen) vs on-chain X25519
  registry.** The registry alternative (ADR-0015's rejected option: fields on
  `Subaccord`/`JurorStake` + a key-registration instruction) is chain-anchored
  and daemon-agnostic, but carries the full program-change ripple (codegen →
  SDK facades → CLI → cranker → fixtures → e2e → SPEC → qedspec), rent, and a
  tx per rotation. Off-chain registration costs one endpoint + a storage
  namespace and binds possession-of-wallet-key just as strongly (Ed25519
  `signMessage` over the registration message). → off-chain; revisit only if
  multiple operators need chain-anchored binding without trusting one daemon's
  registry.

- **Custody — noble keypair, raw secret in IndexedDB (chosen) vs WebCrypto
  non-extractable X25519.** Non-extractable keys survive XSS *exfiltration*
  (usable in-session, not stealable) but split the protocol across two crypto
  backends — the exact "two backends in one module, async-only" split ADR-0015
  rejected — and broaden the browser-support matrix while the SDK is
  isomorphic. The residual (a stolen raw key is silent access to that juror's
  deliveries until rotation) is bounded: keys are per-origin, and rotation is
  one click. The upgrade seam already exists — `x25519SharedSecret()` in
  `evidence/keys.ts` is the single function a non-extractable variant swaps.
  → noble, single path.

- **Replay protection — monotonic `registered_at` in the signed message
  (chosen) vs nonce-challenge vs none.** A replayed old registration must not
  downgrade a juror back to a superseded (possibly exfiltrated) key — that
  chain (XSS key theft → rotation → replay → persistent silent access) is the
  one real attack here. A nonce/echo challenge needs a challenge endpoint +
  session state on a deliberately stateless, no-auth daemon. A signed
  `registered_at` millisecond timestamp, rejected when `≤` the stored value,
  kills every replay of a superseded registration with one field and no extra
  round trip. Residual: clock skew backwards ⇒ rejected registration, retried
  once the clock catches up (vanishingly rare under NTP). → monotonic
  timestamp.

- **Delivery policy — strict (chosen) vs dual-use fallback.** Keeping the
  fallback preserves the current CLI/e2e path at the cost of two delivery code
  paths forever, and the fallback is *unusable in browsers* — the only
  participants it serves are keypair-holding headless jurors. Pre-deployment
  there is nothing to break, so we take the simpler end-state: one delivery
  path, one decrypt implementation. → strict.

- **Registration scope — open (chosen).** Anyone may register a Delivery Key
  for their own pubkey (the signature enforces ownership); no staked/drawn
  gate at registration — delivery already gates on `Round.jurors[]`, and a
  chain-read gate would race with staking/draws. The signed message does not
  bind the daemon origin: the same Delivery Key registered at several daemons
  is a feature, and a cross-daemon replay only ever registers the juror's own
  chosen key.

## Consequences

- **Juror-side Ed→X conversion is deleted from delivery.**
  `ed25519ToX25519PublicKey` survives only on the operator side (claimant →
  operator ingest, unchanged). The delivery HKDF label stays
  `accord-deliver-v1`: the construction (ephemeral X25519 → ECDH → HKDF →
  AES-256-GCM) is unchanged — only the target key differs — and the
  `JurorBundle { out, operator_ephem_pub }` wire shape is identical.
- **SDK gains the whole juror browser path** (`@useaccord/sdk/evidence`): key
  generation, persistence codec, registration client (message builder +
  verifier, shared with the daemon), delivery fetch + decrypt, and the
  self-heal loop. Custom apps get one-call evidence reading — endpoint and
  wallet stay app-side (ADR-0015's split).
- **Multiple app origins ping-pong re-registrations.** One active key per
  juror per daemon means each origin's key goes stale when another app
  registers. Deliberate: the SDK client self-heals — `GET
  /jurors/{pub}/delivery-key`, compare with the stored pub, mismatch ⇒
  re-register (one `signMessage`) + re-pull. No coordination, no stored
  ciphertext to migrate.
- **CLI/e2e churn, not breakage.** Keypair-holding jurors register exactly like
  browsers (`signMessage` over a keypair is plain `ed25519.sign`); the e2e
  harness grows a registration step and its local protocol reimplementation
  switches to X25519-secrets. The CLI gains an additive register command —
  no existing evidence command changes.
- **Daemon grows registration surface.** `PUT`/`GET
  `/jurors/{juror}/delivery-key` + a `DeliveryKeyStore` under the `juror-keys/`
  storage namespace (S3 for HA, fs single-node — the existing seam). Stateless
  replicas share it through shared storage, like everything else.
- **Watermarking (v1.1) is unaffected** — it rides inside the juror-bound
  payload, before encryption; per-file delivery (ADR-0031) switches at the
  same branch point.
- **Known unfixed leak stays for now:** the decrypting manifest GETs
  (`/evidence/{subaccord}/{dispute}[/{round}]`, `/evidence/synod/{case}`)
  still return plaintext to any caller. Out of scope by decision; the tracking
  bean notes that the EVIDENCE-FORMAT §6 public card (`public.summary`,
  `public.options` — labels + salt, `public.entries`) is needed regardless, at
  which point the decrypting endpoints retire in favor of the derived public
  card + juror-bound delivery.

## References

- ADR-0006 (evidence model — trusted re-encryption operator), ADR-0011
  (daemon — amended: registration endpoint), ADR-0015 (evidence crypto in the
  SDK — amended: juror-side dual-use superseded, operator side stands),
  ADR-0017 (manifest format), ADR-0023 (per-round hashes), ADR-0031 (per-file
  transport)
- `apps/evidence-daemon/SPEC.md` §Crypto model, §HTTP API;
  `packages/sdk/src/evidence/`
- `CONTEXT.md` — Delivery Key
