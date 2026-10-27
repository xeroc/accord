---
# accord-ra3p
title: Branding for the docs
status: completed
type: task
priority: normal
created_at: 2026-08-05T03:43:25Z
updated_at: 2026-08-05T04:09:01Z
---

Learn from @./brand files how our brand works. Then customize the mkdocs theme
for @./apps/docs accordingly so we have consistent identity and design and
messaging.

Finally. update the Makefile so we build the docs on `make build`.

Then, research the project and provide as much documentation as possible. Stay
sharp, and concise. don't over document. Narrow the documentation down to the
bare minimum that is required to understand what is going on. strictly no prosa.

## Summary of Changes

- **Brand theme** (BRAND.md → mkdocs): ink + cyan palette via `docs/overrides/styles.css`; `scale-balanced` logo; tagline in footer/copyright; brand-voice site_description. Distinct from Solana purple/green.
- **Makefile**: `build` now builds docs (`make -C apps/docs build`); added `docs`/`docs-serve` targets; `prep` runs `poetry install` in apps/docs.
- **mkdocs.yml**: wired extra_css, brand palette, all 10 ADRs into nav.
- **Docs (19 stub files filled, strictly-no-prose — tables/diagrams/code only)**:
  - reference/: accounts, instructions, state-machine, errors, constants (+index)
  - integration/: arbitrable-interface, subaccords, staking, disputes, draw-voting, appeals, get-ruling (+index)
  - security/: fraud-proofs, sortition-vrf, circuit-breaker (+index)
  - sdk.md
  - Extracted from programs/accord/src (state.rs, lib.rs, errors.rs, constants.rs, events.rs) + SPEC.md + sdk README. ADRs cited by number.
- **Build**: `make docs` green; `mkdocs build` exit 0. Remaining warnings are sanctioned repo-root external links (PROJECT.md/CONTEXT.md/SPEC.md) per apps/docs/AGENTS.md convention.
