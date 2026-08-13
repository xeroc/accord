---
# accord-jnka
title: Add `description` (markdown) field to accord-evidence/v1
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T13:30:00Z
parent: accord-07q3
---

Builder + parser: top-level optional `description` (markdown text). Update EVIDENCE-FORMAT.md §3 schema + field reference. DoD: round-trip buildManifest→parseManifest preserves description; sha256 stable when absent (backward compatible). see milestone §6, §3.

## Summary of Changes

Added an optional top-level `description` (markdown) field to the
`accord-evidence/v1` manifest — builder, parser, and format doc. Round-trip
preserves the markdown verbatim; when absent the manifest bytes are unchanged
(sha256 stable / backward compatible).

### Serialization decision

`description` is emitted as a single **JSON-escaped** line
(`description: "<escaped>"`), placed after `title`. Multi-line markdown
newlines become `\n`. This keeps the manifest one-line-per-field so the
targeted hand-parser needs no YAML block-scalar handling, and `JSON.stringify`
is deterministic and covers all edge cases (`\`, `"`, control chars).

### Files

- `packages/sdk/src/evidence/manifest.ts` — `ManifestInput.description?: string`;
  `buildManifest` emits `description:` only when the value is truthy
  (non-empty) → omitted line ⇒ byte-identical to a pre-`description` manifest.
- `packages/sdk/src/evidence/parse.ts` — `ParsedManifest.description: string`
  (defaults to `""` when absent); `parseManifest` re-quotes + `JSON.parse`s the
  field to unescape markdown.
- `apps/evidence-daemon/EVIDENCE-FORMAT.md` — §3.1 example gains a
  `description:` line (shown in its actual serialized form); §3.2 field
  reference gains the `description` row.
- `apps/app/.../evidence.test.ts` — 3 new tests: markdown round-trip,
  quotes/backslash round-trip, and backward-compat (no `description:` line
  emitted when absent; parser returns `""`).

### Verification (DoD)

- Round-trip `buildManifest → parseManifest` preserves description: ✔ (markdown,
  quotes, backslashes).
- sha256 stable when absent: ✔ — `description` is omitted entirely, so a
  no-description manifest is byte-identical to before (the 14 pre-existing
  byte-stability tests still pass unchanged).
- `pnpm --filter @useaccord/sdk run {lint,test}` → clean / 89 pass.
- `pnpm --filter @useaccord/app run {lint,test,build}` → clean / 17 pass (14
  original + 3 new) / ✓ built.
- Workspace `pnpm run -r --filter "./packages/*" --filter "./apps/*" lint` →
  all green.
