---
# accord-b1kn
title: Release-gated docker images with version tags
status: completed
type: task
priority: normal
created_at: 2026-11-06T12:25:52Z
updated_at: 2026-11-06T12:29:08Z
---

Rework release pipeline docker images: build+push only when changesets publishes a new version; tag image with the released version instead of main.<run_number>.

## Acceptance
- release.yml: release job exposes published + version outputs; docker jobs need [release], gated on published == true, version passed as tag
- build-docker-image.yaml: image tag = inputs.version
- YAML validates (actionlint)

## Summary of Changes
- release.yml: `release` job exports `published` (changesets/action) + `version` (tag step); docker jobs moved to `needs: [release]` + `if: needs.release.outputs.published == true`, version passed through.
- build-docker-image.yaml: single tag `type=raw,value=${{ inputs.version }}` — branch/sha/`main.<run_number>` tags removed.
- Behavior: PRs → no image; version-PR-opening push → no image; version-PR merge (publish + vX.Y.Z tag) → `ghcr.io/xeroc/useaccord-*:<version>`.
- Verified: YAML parse + actionlint green.

## Revision (2026-11-06)
- Restored original metadata tags (branch/tag/pr refs, sha, `main.<run_number>`) alongside the version tag — version is an addition, not a replacement.
- Docker jobs now `needs: [tests, release]` — tests green is an explicit requirement, not only transitive via release.
