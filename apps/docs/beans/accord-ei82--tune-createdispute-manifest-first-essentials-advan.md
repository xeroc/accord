---
# accord-ei82
title: Tune CreateDispute — manifest-first essentials, advanced raw-hashes/nonce, insufficiency-only fee note
status: completed
type: feature
priority: normal
created_at: 2026-08-18T17:55:52Z
updated_at: 2026-08-18T17:56:13Z
---

CreateDispute essentials: subaccord + manifest (title, option labels, evidence URLs) with no mode chrome — the manifest flow IS the form. Manual raw-hash bypass, manifest YAML preview + download, and nonce move behind an advanced collapsible. Fee box drops the always-on balance readout; a red insufficiency note appears only when the loaded balance is below the required fee. EvidenceEditor becomes essentials-only (preview/download lifted to the page).

## Summary of Changes

`/disputes/new` restructured (companion to accord-3iyj):

- **Essentials:** subaccord selector + summary, required-fee box, and the
  evidence manifest editor (title, option labels, evidence URLs). No
  format/manual mode toggle — the manifest flow is *the* form. Submit spine,
  publish-failure recovery, and the raw-hash expressions are byte-identical
  to before; only the source selection changed (`mode: "format"|"manual"` →
  `manual: boolean`, default false).
- **Advanced settings (Radix Collapsible, closed):** manifest YAML preview +
  manual download (lifted out of EvidenceEditor onto the page — editor is now
  essentials-only), raw-hash bypass checkbox (replaces manual mode; when on,
  raw option-hash + evidence-hash inputs render in place of the editor), and
  the nonce + Randomize.
- **Fee box:** the always-on "Your fee-token balance" block is gone. A red
  note renders only when the balance has loaded and is below the required fee
  ("Insufficient SYM balance — X available, Y required"). `canSubmit`
  sufficiency gating unchanged.
- `EvidenceEditor.tsx`: preview/download JSX + `yamlPreview` removed; doc
  header updated to the essentials-only contract. `downloadManifest` still
  exported from the module (page uses it).

### Verification

- apps/app: tsc green, 37/37 node tests, vite build green.
- Live-browser QA (vite dev + full provider stack render via module graph):
  advanced collapsed hides nonce/bypass/preview; opening reveals them; nonce
  Randomize changes value; bypass checkbox swaps editor ⇄ raw hash inputs;
  editor renders title/labels/URLs only (no preview); "Format mode"/"Manual
  mode"/"Your fee-token balance" strings gone from the DOM.

## REWRITTEN SCOPE (2026-08-18 — supersedes the manual-mode description above)

Correction after review: "manual" is NOT a manifest bypass with raw hashes —
it is a **manual manifest** path. Advanced settings now offer "Provide the
manifest manually": paste a pre-authored `manifest.yaml` (textarea) plus its
option hashes (raw hex inputs), both inside the advanced collapsible. The
pasted bytes are hashed (`sha256` → evidence_hash), encrypted, and published
to the daemon exactly as authored; no submit-time re-download (the filer
already holds the file). Essentials swap the editor for a summary box that
live-parses the paste (`parseManifest`: title, options, entries) and points
at advanced. Soft validation on submit: paste non-blank + parses to ≥ 2
options + ≥ 2 valid option hashes. The raw evidence-hash input is gone —
evidence hash is always derived from a manifest in this UI. Re-verified in
browser: checkbox ⇄ editor/summary swap, parse feedback, hash counter,
toggle-off restore.
