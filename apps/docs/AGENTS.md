# Accord — Docs Site

## Purpose

Developer documentation for **integrating** the Accord — the
Schelling-point arbitration primitive on Solana. The audience is Solana
program developers who want to add dispute resolution to their protocol via
the Arbitrable CPI (`create_dispute` → `get_ruling`).

## What belongs here

- **Integration guides** — step-by-step how to file disputes, stake as a juror,
  read rulings, handle appeals.
- **Protocol reference** — accounts/PDAs, instruction signatures, state machine,
  error codes, constants.
- **Security model** — snapshot fraud proofs, sortition enforcement, VRF
  integration, circuit breaker. Enough for an integrator to trust the mechanism
  without reading the source.
- **SDK reference** — `@veridao/sdk` TypeScript types and usage.
- **ADR index** — the architecture decisions, served as browsable pages under
  `docs/adr/`. The ADR files are the **source of truth** for _why_ the protocol
  works the way it does.

## What does NOT belong here

- **Rationale essays** → `PROJECT.md` (root). The docs site links to it but
  doesn't duplicate it.
- **Domain glossary** → `CONTEXT.md` (root). Linked from the Overview page.
- **Build spec** → `programs/accord/SPEC.md`. Linked from Protocol Reference.
- **Implementation details** → the Rust source. Docs describe the interface,
  not the implementation.

## Structure

```
apps/docs/
  mkdocs.yml          # MkDocs config (this site)
  AGENTS.md           # This file
  docs/               # Content served by mkdocs
    index.md          # Overview — what + why (condensed from PROJECT.md)
    quickstart.md     # 5-minute minimal integration
    integration/      # Step-by-step guides
    reference/        # Protocol reference (accounts, instructions, errors)
    security/         # Trust model, fraud proofs, sortition, VRF
    adr/              # Architecture Decision Records (moved from docs/adr/)
    sdk.md            # TypeScript SDK reference
```

## Build

```bash
cd apps/docs
make serve    # local dev server
make build    # static site in apps/docs/site/
```

## Conventions

- **ADRs are read-only here** — they're authored in the ADR format (see
  `docs/adr/0001` for the template) and moved here via `git mv`. Don't edit
  ADRs in place; create a new superseding ADR instead.
- **Code examples** use TypeScript (SDK) and Rust (CPI). Anchor IDL types are
  the canonical reference.
- **Cross-references** to `PROJECT.md`, `CONTEXT.md`, and `SPEC.md` use relative
  links to the repo root (`../../../PROJECT.md`).
