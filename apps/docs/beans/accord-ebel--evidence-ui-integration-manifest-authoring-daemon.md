---
# accord-ebel
title: Evidence-UI integration — manifest authoring + daemon publish
status: completed
type: milestone
priority: normal
created_at: 2026-08-11T00:56:10Z
updated_at: 2026-08-11T04:00:08Z
---

## Evidence-UI integration — manifest authoring + daemon publish

> **Authoritative spec:** `meta/specs/evidence-ui-integration.md` (all 7 design
> decisions, full module contract, diff map, flows). Read it first.
> **Bridges:** `accord-uvru` (dApp MVP — explicitly _excluded_ evidence) ↔
> `accord-yjno` (Evidence Operator Daemon). This milestone wires the two: the
> dApp authors the evidence manifest and publishes it to the daemon.

## What

Let a filer author the `accord-evidence/v1` manifest in the dispute-creation UI,
derive the on-chain commitments (`evidence_hash`, `options[]`) from it, file the
dispute, and publish the encrypted manifest to the evidence daemon. Keep the
manual-hash path as a fallback. **Isolate all evidence domain logic in a new
module** (`features/dispute/evidence/`); **surgical glue only** to
`CreateDispute.tsx` + `DisputeDetail.tsx`.

## Scope

**In:** manifest authoring UI (structured form + YAML preview), option-salt
derivation + self-verify, `claimantEncrypt` + POST, POST-failure recovery
(on-form retry + detail-page upload), format spec edit (path→URL, all-zero
sentinel).
**Out (TODO, §7):** multi-MIME blob transport (daemon path A), on-chain
option-hash enforcement (ADR-0017), daemon `HEAD` endpoint (Tier-3
auto-detection), best-effort URL fetch/paste, `public` block (confidentiality).

## HANDOFF

### 1. Happy Path

**Format-mode submit** (`CreateDispute.tsx`, mode = `format`):

1. Filer fills structured form (title, summary, option labels, URL entries).
2. `<EvidenceEditor>` emits manifest input; app derives dispute PDA via `findDisputePda(programId, filer, nonce)` for the manifest's `dispute` field.
3. `buildManifest` serializes ONCE → single `Uint8Array` buffer (this _is_ creating `evidence_hash`).
4. `deriveOptionHashes(salt, labels)` → `options[]`; `verifyOptionHashes` asserts consistency (fails closed).
5. On submit click: **trigger `manifest.yaml` download synchronously, before any `await`** (browser gesture protection).
6. `createDispute({options, evidenceHash, nonce, fee})` → `sendInstruction` — spine **unchanged** (`CreateDispute.tsx:145-166`); only the source of `options` (L155) + `evidenceHash` (L156) differs by mode.
7. `await publishEvidence(...)` (claimantEncrypt + POST to daemon). Success → navigate. Fail → stay-on-form: `[Retry publish]` (POST-only) / `[View dispute]`.

**Recovery** (`DisputeDetail.tsx`): "Publish evidence" → upload `manifest.yaml` → `verifyManifestHash(sha256(manifest) == dispute.evidenceHashes[0])` → `publishEvidence`. Idempotent.

### 2. Data Contract

- **Module** `apps/app/src/features/dispute/evidence/`:
  - `manifest.ts` — `buildManifest(input, ctx): Uint8Array` (single buffer), `SHA256_ZERO` (all-zero `[u8;32]` sentinel).
  - `options.ts` — `generateSalt(): Uint8Array`, `deriveOptionHashes(salt, labels): Uint8Array[]`, `verifyOptionHashes(salt, labels, hashes): void` (throws).
  - `publish.ts` — `publishEvidence({endpoint, subaccord, dispute, manifest, operatorPub}): Promise<void>`, `verifyManifestHash(manifest, evidenceHash): void` (throws).
  - `EvidenceEditor.tsx` — structured form + read-only YAML preview + Download button.
- **Manifest entry (MVP):** `{ path: <url>, sha256: <all-zero sentinel> }`. `path` accepts URL or relative POSIX path. All-zero `sha256` ⇒ juror skips leaf verification (root gate still applies).
- **Option encoding:** `option_salt` = 32 random bytes (app-generated); `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))`.
- **SDK deps (all confirmed present):** `findDisputePda` (`packages/sdk/src/methods/dispute.ts:178`), `claimantEncrypt` (`packages/sdk/src/evidence/ecies.ts:65`), `subaccord.evidenceOperator` (via `useSubaccord`).
- **Daemon endpoint:** `POST /evidence/{subaccord}/{dispute}` (round 0), body = `{ct, claimant_ephem_pub, wrapped, plaintext_hash}` as base64 JSON (`apps/evidence-daemon/src/server/routes.ts:50`). Endpoint URL is a fixed app config (centralized operator).

### 3. Edge Cases & Constraints

- **Single-buffer invariant (non-negotiable):** `buildManifest` serializes once; that one buffer feeds the YAML preview, `sha256`→`evidence_hash`, and `claimantEncrypt`→POST. Never re-serialize. (`EVIDENCE-FORMAT.md §2`: no canonicalization needed — manifest delivered verbatim.)
- **Download-gesture:** the `manifest.yaml` download MUST fire synchronously in the submit handler before the first `await`; browsers drop user-activation after `await`. The preview panel also keeps a manual Download button.
- **Retry is POST-only (critical):** once `sendInstruction` succeeds the dispute exists. Re-running `handleSubmit` collides (same nonce/PDA → `init` rejects) or orphans (new nonce). The retry button calls `publishEvidence` ONLY. Safe: daemon ingest is idempotent on `(dispute, round, plaintext_hash)` (`ingest.ts:147-156`) — same manifest → `201` no-op, first POST wins.
- **Self-verify is app-side (D2):** `verifyOptionHashes` runs pre-submit. Nothing on-chain enforces `options[i] == sha256(salt‖label)` today (ADR-0017 open). The daemon never parses manifest semantics — it carries ciphertext only.
- **Manual mode preserved:** the status-quo raw-hash path stays; `mode` state toggles. `handleSubmit`'s spine is identical across modes.
- **Surgical:** no spine duplication, no extraction of working code. `CreateDispute` owns the spine; the evidence module owns all domain logic.

### 4. Business Logic (pseudo-code, TypeScript)

```typescript
// manifest.ts — THE single buffer
function buildManifest(input: ManifestInput, ctx: ManifestCtx): Uint8Array {
  const salt = input.salt ?? generateSalt(); // 32 random bytes
  const obj = {
    schema: "accord-evidence/v1",
    dispute: ctx.dispute,
    subaccord: ctx.subaccord,
    filer: ctx.filer,
    filed_at: ctx.filedAt,
    language: "en",
    title: input.title,
    option_salt: hex(salt),
    options: input.labels.map((label, index) => ({ index, label })),
    entries: input.entries.map((e) => ({
      path: e.path,
      sha256: hex(e.sha256 ?? SHA256_ZERO),
    })),
  };
  return yamlSerialize(obj); // one buffer → preview + hash + encrypt
}

// options.ts
const deriveOptionHashes = (salt: Uint8Array, labels: string[]) =>
  labels.map((l) => sha256(concat(salt, utf8(l))));
function verifyOptionHashes(salt, labels, hashes) {
  const d = deriveOptionHashes(salt, labels);
  if (!d.every((h, i) => equal(h, hashes[i])))
    throw new Error("option-hash mismatch");
}

// publish.ts
async function publishEvidence({
  endpoint,
  subaccord,
  dispute,
  manifest,
  operatorPub,
}) {
  const bundle = await claimantEncrypt(manifest, operatorPub); // @useaccord/sdk/evidence
  const res = await fetch(`${endpoint}/evidence/${subaccord}/${dispute}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ct: b64(bundle.ct),
      claimant_ephem_pub: b64(bundle.claimant_ephem_pub),
      wrapped: b64(bundle.wrapped),
      plaintext_hash: b64(bundle.plaintext_hash),
    }),
  });
  if (res.status !== 201)
    throw new Error(`evidence publish failed: ${res.status}`);
}
function verifyManifestHash(manifest: Uint8Array, evidenceHash: Uint8Array) {
  if (!equal(sha256(manifest), evidenceHash))
    throw new Error("manifest hash mismatch");
}
```

### 5. Definition of Done

- [ ] Evidence module isolated in `features/dispute/evidence/`; no evidence domain logic leaks into `CreateDispute.tsx`/`DisputeDetail.tsx`.
- [ ] Format-mode submit produces on-chain `evidence_hashes[0] == sha256(manifest)` and `options[i] == sha256(salt‖label_i)` (self-verified).
- [ ] POST publishes the encrypted manifest to the daemon (daemon `201`).
- [ ] POST-failure: on-form retry (POST-only) recovers without re-creating the dispute.
- [ ] `DisputeDetail` "Publish evidence" recovers via upload + hash gate.
- [ ] Manual-hash mode unchanged (status quo preserved).
- [ ] `EVIDENCE-FORMAT.md` §3.2 edited (path→URL, all-zero sentinel, v2 note).
- [ ] `make lint` green; `pnpm -r run build` green (workspace stays green).

### 6. Test Matrix (Given / When / Then)

- Given a manifest input, When `buildManifest`, Then identical input → byte-identical buffer → identical `sha256` (byte-stability).
- Given salt + labels, When `deriveOptionHashes` then `verifyOptionHashes`, Then passes; given a tampered label, Then `verifyOptionHashes` throws.
- Given a manifest + operatorPub, When `publishEvidence`, Then daemon returns `201`; When retried with the same manifest, Then `201` idempotent (no re-create).
- Given format-mode submit, When `sendInstruction` succeeds but POST fails, When `[Retry publish]`, Then `publishEvidence` runs alone and the dispute is NOT re-created.
- Given a downloaded `manifest.yaml`, When uploaded on the dispute-detail page, When `sha256(manifest) == evidenceHashes[0]`, Then `publishEvidence` runs; When mismatch, Then rejected.
- Given manual mode, When submitted, Then behaves exactly as today (no regression).

### 7. Open Questions (recorded assumptions — proceed, do not freeze)

- **Multi-MIME blob transport** (daemon path A): store key `(subaccord, dispute, round, path)`, per-file re-encrypt, real leaf gates, archive-bundle upload. Deferred to v2. TODO in-code.
- **On-chain option-hash enforcement** (ADR-0017): `create_dispute` could enforce `options[i] == sha256(salt‖label)`. Closes D2 trustlessly for third-party filers. Deferred.
- **Daemon `HEAD /evidence/...`**: enables Tier-3 auto-detection (detail page knows evidence is unpublished). Replaces always-on "Publish evidence". Deferred.
- **Best-effort URL fetch + paste** for entry `sha256` (alternative to all-zero sentinel). Post-MVP.
- **`public` block** (confidentiality/publication controls): v1 ships fully-confidential-only. Deferred.
