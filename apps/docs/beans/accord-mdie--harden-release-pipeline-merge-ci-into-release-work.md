---
# accord-mdie
title: Harden release pipeline — merge CI into Release workflow, gate publish on tests, changesets/action v2
status: in-progress
type: feature
created_at: 2026-09-28T08:36:18Z
updated_at: 2026-09-28T08:36:18Z
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
