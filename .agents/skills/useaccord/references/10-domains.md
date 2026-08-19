# Domains — Rules-Doc Registry (ADR-0027)

Public content-addressed store for domain rules docs on the evidence daemon.
Canon defines a Subaccord's `domain_ref` / a CanonList's `rules_hash` as
`sha256(rules_doc)` over the raw file bytes (YAML frontmatter included). The
daemon is a dumb CAS — `PUT`/`GET /domains/{hash}` — and never parses.

Doc-first flow: author writes `rules.md` → `domain:put` prints the hash →
create the list / Subaccord with that hash on-chain → readers
`domain:get` + verify.

## Commands

```bash
# Publish (sha256 printed on stdout)
useaccord domain:put rules.md --daemon-url http://127.0.0.1:3000

# env fallback for --daemon-url
ACCORD_DAEMON_URL=https://daemon.example.com useaccord domain:put rules.md

# Fetch + re-hash verify + print (metadata, then body verbatim)
useaccord domain:get <hash> --daemon-url http://127.0.0.1:3000

# Body only (redirect to a file)
useaccord domain:get <hash> --quiet > rules.md
```

## Flags

Both commands are pure/offline (no `--rpc`/`--keypair`).

| Flag             | Env                 | Description                                      |
| ---------------- | ------------------- | ------------------------------------------------ |
| `--daemon-url`   | `ACCORD_DAEMON_URL` | Evidence-daemon base URL (required: flag or env) |
| `--json`         | —                   | Single JSON object on stdout                     |
| `--quiet` / `-q` | —                   | Hash only (`put`) / body only (`get`)            |

`domain:put <file>` takes the doc path as its single arg; `domain:get <hash>`
takes the 64-hex sha256.

## Semantics

- `put` hashes locally (SDK `hashDomainDoc`) and PUTs the raw bytes:
  `201` published · `200` identical bytes already stored (no-op) · `409`
  different bytes at that hash (collision alarm — the CAS never overwrites) ·
  `413` over the daemon's 1 MiB cap.
- `get` uses SDK `fetchDomainDoc`: fetch, verify `sha256(bytes) === hash`
  (throws on mismatch), parse optional frontmatter (`title`, `description`,
  `version`); unknown hash ⇒ 404 error, exit 1.
- Content-Type sent by `put`: `text/markdown` for `.md`/`.markdown`, otherwise
  `application/octet-stream`; the daemon stores it and returns it on GET.
- On-chain `rules_hash` / `domain_ref` binding: pass the printed hash when
  creating the CanonList / Subaccord; verify with `verifyDomainDoc` (SDK).

## SDK functions

| CLI command  | SDK fn           |
| ------------ | ---------------- |
| `domain:put` | `hashDomainDoc`  |
| `domain:get` | `fetchDomainDoc` |

Recommended doc format: markdown with optional YAML frontmatter (`title`,
`description`, `version`); the body is the rules. The hash covers the raw file
bytes — frontmatter included.
