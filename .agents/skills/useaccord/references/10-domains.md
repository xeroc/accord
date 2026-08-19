# Domains — Rules-Doc Registry (ADR-0027, as amended)

Public content-addressed store for domain rules docs on the evidence daemon.
Canon defines a Subaccord's `domain_ref` / a CanonList's `rules_hash` as
`sha256(rules_doc)` over the raw file bytes (YAML frontmatter included). The
daemon never parses — but `PUT` is **chain-anchored** (ADR-0027 amendment):
`PUT /domains/{hash}?subaccord=<addr>` requires the anchor Subaccord to exist
on-chain with `domain_ref == hash` (polled ≤ 1 s for commitment lag).

Create-first flow: author writes `rules.md` → hash client-side → create the
list / Subaccord with that hash on-chain → wait for the create-tx to confirm →
`domain:put --subaccord <anchor>` publishes the bytes → readers
`domain:get` + verify. Publish failure ≠ creation failure — retry the put; the
half-state (list live, doc missing) is loud by design.

## Commands

```bash
# Publish (sha256 printed on stdout) — anchor = the backing Subaccord whose
# domain_ref is the doc hash; must already exist on-chain (create-first)
useaccord domain:put rules.md --subaccord <subaccord-addr> \
  --daemon-url http://127.0.0.1:3000

# env fallback for --daemon-url
ACCORD_DAEMON_URL=https://daemon.example.com \
  useaccord domain:put rules.md --subaccord <subaccord-addr>

# Fetch + re-hash verify + print (metadata, then body verbatim) — ungated
useaccord domain:get <hash> --daemon-url http://127.0.0.1:3000

# Body only (redirect to a file)
useaccord domain:get <hash> --quiet > rules.md
```

## Flags

| Flag             | Env                 | Description                                             |
| ---------------- | ------------------- | ------------------------------------------------------- |
| `--subaccord`    | —                   | (put, REQUIRED) Anchor Subaccord address gating the PUT |
| `--daemon-url`   | `ACCORD_DAEMON_URL` | Evidence-daemon base URL (required: flag or env)        |
| `--json`         | —                   | Single JSON object on stdout                            |
| `--quiet` / `-q` | —                   | Hash only (`put`) / body only (`get`)                   |

`domain:put <file>` takes the doc path as its single arg; `domain:get <hash>`
takes the 64-hex sha256. `domain:put` is online (reads the chain via the
daemon's anchor gate; no local `--rpc`/`--keypair`); `domain:get` is
read-only.

## Semantics

- `put` hashes locally (SDK `hashDomainDoc`) and PUTs via SDK
  `putDomainDoc`; the daemon anchor-verifies `domain_ref == hash` server-side:
  `201` published · `200` identical bytes already stored (no-op) · `404`
  anchor Subaccord not found (create-tx unconfirmed or wrong address) · `400`
  anchor `domain_ref ≠` doc hash / body sha mismatch / missing `--subaccord` ·
  `409` different bytes at that hash (collision alarm — the CAS never
  overwrites) · `413` over the daemon's 1 MiB cap.
- `get` uses SDK `fetchDomainDoc`: fetch, verify `sha256(bytes) === hash`
  (throws on mismatch), parse optional frontmatter (`title`, `description`);
  unknown hash ⇒ 404 error, exit 1. No anchor, no auth.
- Content-Type sent by `put`: `text/markdown` for `.md`/`.markdown`, otherwise
  `application/octet-stream`; the daemon stores it and returns it on GET.
- On-chain `rules_hash` / `domain_ref` binding: create the CanonList /
  Subaccord FIRST with the computed hash, then publish; verify any doc against
  the on-chain ref with `verifyDomainDoc` (SDK).

## SDK functions

| CLI command  | SDK fn                                          |
| ------------ | ----------------------------------------------- |
| `domain:put` | `hashDomainDoc`, `putDomainDoc` (`--subaccord`) |
| `domain:get` | `fetchDomainDoc`                                |

Recommended doc format: markdown with optional YAML frontmatter (`title`,
`description`); the body is the rules. There is no `version` key — the doc is
content-addressed and immutable, so the hash IS the version. The hash covers
the raw file bytes — frontmatter included.
