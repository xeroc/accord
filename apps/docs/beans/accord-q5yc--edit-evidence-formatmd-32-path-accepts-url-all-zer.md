---
# accord-q5yc
title: Edit EVIDENCE-FORMAT.md §3.2 — path accepts URL, all-zero sha256 sentinel, v2 archive-bundle note
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T00:56:38Z
parent: accord-2nzr
---

Doc must match reality (AGENTS.md §Documentation). Relax entries[].path to 'URL or relative POSIX path'; document all-zero sha256 sentinel (juror skips leaf verification, root gate still applies); mark relative-path archive bundles as v2. Add in-code TODOs per HANDOFF §7.

## Summary of Changes

Edited `apps/evidence-daemon/EVIDENCE-FORMAT.md` so the format reference matches the v1 implementation reality of the Evidence-UI integration milestone (`accord-ebel`). Seven surgical edits, no code touched (doc-only bean):

1. **§2 — all-zero sentinel documented.** New "All-zero sentinel (leaf skip)" paragraph: an entry whose `sha256` is `0000…0000` (64 zeros) skips leaf verification (check 2); the root gate (check 1) still covers it because the manifest bytes hash into `evidence_hash`. Inline TODO for the v1.1 best-effort URL-fetch+paste alternative.

2. **§3.1 example — URL + sentinel entry.** Added a final `entries[]` row (`https://example.com/contract.pdf`, sha256 `0000…00`) with a comment, illustrating both relaxations in one line.

3. **§3.2 field reference — relaxed.** `entries[].path` now "URL (any fetchable scheme) **or** relative POSIX path"; `entries[].sha256` now allows the all-zero sentinel to skip leaf verification (cross-ref §2). Notes the relative-path archive-bundle model as v2.

4. **§6 — `public` marked v1-deferred.** Blockquote at the top of §6 records that v1 ships fully-confidential-only (dApp MVP omits `public`); the section body remains the intent spec for a future build.

5. **§7.1 — v1 vs v2 transport (new subsection).** The "relative-path archive bundles as v2" note: v1 = manifest-only (URL/sentinel entries, one encrypted bundle keyed `(subaccord, dispute, round)`); v2 = daemon "path A" (per-path store key, per-file re-encrypt, real leaf gates, archive-bundle upload).

6. **§8 Juror flow step 3 — sentinel skip.** Leaf-verification step now branches: all-zero sentinel → skip; else `require sha256(file) == entry.sha256`.

7. **§11 Open / future — HANDOFF §7 deferrals recorded as TODOs.** Added explicit bullets for: multi-MIME archive-bundle transport (v2), best-effort URL fetch+paste (post-MVP), daemon `HEAD /evidence/...` (Tier-3 auto-detection), and the `public` block (v1 fully-confidential-only). Existing bullets (option-hash enforcement, aggregation variants, watermarking, multi-file delivery, public-card authenticity) preserved.

### Verification

Doc-only change — markdown prose, no code/types/build artifacts affected. `make lint` surfaces only a pre-existing `packages/canon` failure (`node_modules` missing in this worktree — `make prep` not run; `Cannot find module '@solana/kit'`), unrelated to and unfixable by this `.md` edit. The edited file's internal cross-references (§2, §6, §7, §7.1, §11) all resolve; the spec now matches the milestone HANDOFF data contract (`{ path: <url>, sha256: <all-zero sentinel> }`, relative-path archive bundles = v2).
