---
# accord-lstu
title: Integrate with reference escrow program from solana foundation
status: scrapped
type: task
priority: normal
created_at: 2026-08-06T04:22:39Z
updated_at: 2026-08-31T18:02:50Z
---

## sources of the solana foundation escrow contract

<https://github.com/solana-foundation/escrow>

## Reasons for Scrapping (2026-08-31 — superseded by Synod)

This draft predates the in-repo escrow Arbitrable. Synod (`programs/synod`, ADRs `synod/0001`–`0002`, SDK `packages/synod`, dApp, green e2e suite) IS the escrow integration today: an N-party dispute-escrow purpose-built on the Accord CPI (named 2–7 party roster, equal stake, file-on-full-roster, pot to the prevailing party). Integrating the Solana Foundation reference escrow would add a second, weaker escrow path with no remaining use case. Nothing was ever started from this bean (body was a bare link list).
