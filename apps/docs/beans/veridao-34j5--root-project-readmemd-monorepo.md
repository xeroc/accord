---
# veridao-34j5
title: Root project README.md (monorepo)
status: completed
type: task
priority: normal
created_at: 2026-08-05T02:48:22Z
updated_at: 2026-08-05T02:54:49Z
---

Author the root README.md for the Accord monorepo per the readme skill: local dev, architecture, deploy, troubleshooting. Distinct from the SDK package README (veridao-sl3x).

## Summary of Changes

Authored the root `README.md` for the Accord monorepo (readme skill).

- Full dev guide: clone → `make prep` → `make build` → tests (LiteSVM + jest/Surfpool).
- Architecture: monorepo layout, dispute-lifecycle Mermaid state diagram, PDA/account model, VRF sortition, economics, evidence flow.
- Arbitrable CPI interface (create_dispute / get_ruling) in Rust + TS.
- Commands table, two-harness testing philosophy, the `no-entrypoint` quirk, honest Project Status table, deployment (program ID, Squads upgrade auth, pause init), troubleshooting (edition2024, .so-before-tests, keys sync).
- Verified: `markdownlint-cli` clean under the project rule set; TOC anchors valid.

Repo-URL follow-on: `github.com/veridao/accord` → `github.com/xeroc/accord` in README.md (clone cmd) and apps/docs/mkdocs.yml (repo_url, repo_name, social link). AGENTS.md + CONTEXT.md have no repo-URL field (no change). docs.veridao.org + twitter.com/veridao kept as brand assets.
