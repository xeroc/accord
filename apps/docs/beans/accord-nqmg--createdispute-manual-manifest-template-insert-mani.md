---
# accord-nqmg
title: CreateDispute manual manifest — template insert + manifest→hash auto-sync
status: completed
type: feature
priority: normal
created_at: 2026-08-18T18:40:21Z
updated_at: 2026-08-18T18:40:34Z
---

Manual-manifest advanced flow gains an 'Insert template' button (buildManifest with live ctx + fresh salt, disabled until wallet+subaccord resolve) and an auto-sync effect: parseManifest on every paste/edit, deriveOptionHashes(option_salt, labels) fills the option-hash inputs. Hashes are one-way, so sync is manifest→hashes only; a hand-edited hash slot is detected (empty or equal to last derived) and never clobbered. Hint line documents the behavior.

## Summary of Changes

- `CreateDispute.tsx` advanced manual-manifest section:
  - **Insert template** button beside the `manifest.yaml` label — prefills the
    textarea with a valid `accord-evidence/v1` skeleton via `buildManifest`
    (real filer/subaccord/dispute from the live ctx, fresh `generateSalt`,
    placeholder title/labels/entry). Disabled until `manifestCtx` resolves
    (tooltip says why).
  - **Manifest → option-hash sync** (`useEffect` on `[manual, manifestText]`):
    `parseManifest` → `deriveOptionHashes(option_salt, labels)` → fills the
    hash inputs (hex-encoded). Sync is one-directional because sha256 is —
    the manifest is the source of truth. Pristine guard: a slot is only
    auto-filled when empty or still equal to the previously derived value, so
    hand-edited hashes survive later manifest edits.
  - Hint under the textarea: "Option hashes below auto-derive from this
    manifest's option_salt + labels — edit a hash to override it."

### Verification

- apps/app: tsc green, 37/37 node tests, vite build green.
- Live-browser QA: template button disabled without ctx; pasting a manifest
  auto-fills 2 valid 64-hex hashes; derived values byte-match the SDK
  (`sha256(salt ‖ label)` recomputed in node); hand-edited slot survives a
  salt change while the untouched slot re-derives.
