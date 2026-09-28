---
# accord-mdie
title: Harden release pipeline — merge CI into Release workflow, gate publish on tests, changesets/action v2
status: completed
type: feature
priority: normal
created_at: 2026-09-28T08:36:18Z
updated_at: 2026-09-28T08:45:50Z
---

Research showed: release.yml published without test gating, changesets/action@v1 with @changesets/cli@3, umbrella v-tag fired unconditionally, no changeset presence check on PRs, and main.yaml+release.yml duplicated push-to-main runs. The first true CI publish (0.3.0) failed E404 until the npm trusted publisher was fixed, then succeeded via rerun.

Scope:

- Merge main.yaml jobs (landingpage, program-tests, tests, docker images) into release.yml; delete main.yaml
- Release job gated: needs [tests, program-tests], main-only, never on PRs; workflow_dispatch as publish retry
- changesets/action v1 -> v2 (v2 renamed inputs: version-script/publish-script/commit-message/pr-title), create-github-releases: false to keep npm-only behavior
- Umbrella v-tag gated on outputs.published == 'true'
- New changeset-status job on PRs (changeset status --since main), exempting changeset-release/*
- Per-job least-privilege permissions (workflow-level permissions: {})
- AGENTS.md Releases section updated to match

## Summary of Changes

- `release.yml` is the single pipeline: main.yaml deleted, its jobs (landingpage, program-tests, tests, docker images) folded in.
- Publish gated: `release` job `needs: [tests, program-tests]`, main-only (`push`/`workflow_dispatch`), skipped on PRs — verified skipped on PR #8.
- `changesets/action@v2` with renamed inputs (`version-script`/`publish-script`/`commit-message`/`pr-title`); `create-github-releases: false` preserves npm-only behavior.
- Umbrella `vX.Y.Z` tag gated on `outputs.published == 'true'`.
- New `changeset-status` job on PRs: `pnpm changeset status --since origin/main` (origin/ prefix required — PR checkouts have no local `main` for merge-base; first iteration failed on PR #8 exactly this way, fixed and verified green).
- Workflow-level `permissions: {}`, per-job least privilege; reusable calls verified green under scoped grants.
- AGENTS.md §Releases updated. PR: xeroc/accord#8.
