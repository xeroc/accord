# @useaccord/synod

TypeScript SDK for [Accord Synod](../../programs/synod) — the N-party
dispute-escrow Arbitrable that runs on top of [Accord](../sdk).

Synod escrows equal stakes from a named 2–7 party roster, files one dispute
via CPI when the roster is full, and pays the pot to the prevailing party
from the Accord ruling (`programs/synod/SPEC.md` is the authority).

> **Status: scaffold.** The on-chain program is a stub and this package
> currently ships only the Codama-generated client
> (`src/generated` — regenerated via `pnpm run codegen`, never hand-edited).
> The hand-written facade (PDA helpers, per-instruction methods, fetchers —
> mirroring `@useaccord/canon`) lands with the Synod v1 build.

## Install

```sh
pnpm add @useaccord/synod @solana/kit
```

## Build

```sh
pnpm --filter @useaccord/synod run build     # tsup (bundle) + tsc --emitDeclarationOnly
pnpm --filter @useaccord/synod run codegen    # regenerate from IDL (after anchor build)
pnpm --filter @useaccord/synod run test       # codegen wiring smoke test
```

## Authority

ADR-0010 (SDK facade pattern) · `programs/synod/SPEC.md` · `synod/0001`–`0002`
