---
# accord-3mzc
title: Implement EvidenceEditor.tsx — structured form + read-only YAML preview + Download button
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T05:30:00Z
parent: accord-1d3i
blocked_by:
  - accord-2z1v
---

React component: title/summary/option-labels/URL-entries inputs + read-only <pre> of the serialized manifest bytes + Download manifest.yaml button. Emits manifest input up. See HANDOFF §1 + spec Q4(c).

## Summary of Changes

- `apps/app/src/features/dispute/evidence/EvidenceEditor.tsx` — structured form (title, option labels, evidence URL entries) + live read-only YAML preview via `buildManifest(input, ctx)` + Download `manifest.yaml` button. Emits `ManifestInput` upward via `onInput` on every change. Salt generated once on mount (stable across re-renders). Styling matches CreateDispute conventions.
- `apps/app/src/features/dispute/evidence/index.ts` — added `EvidenceEditor` to barrel.
- Summary field deferred: `ManifestInput` data contract has no `summary` field (lives in future `public` block, §7). Title covers the human-readable aspect in v1.
- `pnpm -r run build` + app typecheck green.
