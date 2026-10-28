# @useaccord/evidence-daemon

## 0.8.1

### Patch Changes

- [#31](https://github.com/xeroc/accord/pull/31) [`aef663c`](https://github.com/xeroc/accord/commit/aef663cdec89cd8e11196c214f071b2c2eaaf6ad) Thanks [@xeroc](https://github.com/xeroc)! - evidence-daemon: wire the jury-telemetry read side into the composition root (ADR-0037; surface beans accord-0xih/accord-f6hh/accord-heqb)

  - `GET /trace/{dispute}` 404ed `{"error":"trace replay not enabled"}` on every
    deployment: `createServerDeps` never wired `traceReplay`, so the route's
    unwired-seam guard fired unconditionally — the store was never touched.
    `TRACE_ENABLED=true` only arms POST ingest; it never gated replay.
  - `WS /watch/{dispute}` was equally dead: `WatchHub`/`watchRoutes`/
    `websocketHandlers` existed and were unit-tested but `main.ts` never mounted
    them. Now mounted, with ingest fan-out wired (`traceFanout` → `hub.publish`)
    so live frames reach subscribers.
  - New env knobs documented in SPEC but never parsed: `TRACE_BUFFER_PER_DISPUTE`
    and `TRACE_MAX_CLIENTS_PER_IP` (defaults 512 / 8; malformed values fail loud
    at boot).
  - New `src/wire.test.ts` pins the composition: full deps over real fs stores →
    `GET /trace` must answer 200, not the unwired-seam 404.

- Updated dependencies []:
  - @useaccord/sdk@0.8.1
  - @useaccord/synod@0.8.1

## 0.8.0

### Minor Changes

- [#27](https://github.com/xeroc/accord/pull/27) [`3e41b6a`](https://github.com/xeroc/accord/commit/3e41b6ae3e479915bdbfbf34f231f85b7eb1a88b) Thanks [@xeroc](https://github.com/xeroc)! - Jury telemetry read side (ADR-0037): seal-on-read predicate + unseal flush scheduler (`src/pipeline/seal.ts` — one `sealVisible` gate every read path applies; per sealed frame a timer at `unsealAt` re-fans out), the replay endpoint `GET /trace/{dispute}?fromSeq=` (durable record, seal-filtered, any replica), and the live watch surface `WS /watch/{dispute}` (`src/server/watch.ts` — replay-then-live over store tail ∪ ring buffer, per-IP connection cap, ping keepalive; sealed verdicts flush at `unsealAt`). Push leg and trace store land with their beans (beans accord-0yxb, accord-f6hh, accord-heqb).

### Patch Changes

- [#27](https://github.com/xeroc/accord/pull/27) [`e6eaa63`](https://github.com/xeroc/accord/commit/e6eaa632eb273735d12b0896963a62550ac98872) Thanks [@xeroc](https://github.com/xeroc)! - cancel_dispute remainingAccounts: single-source derivation + AppealBond seed fixes (bean accord-br6a)

  - SDK: new `deriveCancelDisputeRemainingAccounts` mirrors the on-chain strict
    accounting (current Round + panel only when seats were drawn, prior rounds +
    panels, AppealBond seeds 0..currentRound-1; EMPTY for a never-drawn stall).
  - Cranker `cancel_dispute` no longer pushes the current-round PDA
    unconditionally — that made every pre-draw cancel (dead VRF oracle) revert
    with `InvalidPanelSize` (cancel_dispute.rs:261) — and now carries prior
    rounds it previously omitted entirely.
  - Cranker `finalize_dispute` + reconciler `claim_refund` sweep: AppealBond
    seeds were off by one (1..currentRound); the first appellant's bond (seed 0)
    was never swept and appealed finalizes reverted.
  - CLI `dispute:cancel --remaining-accounts auto` now uses the SDK derivation
    (old auto interleaved rounds/bonds in the wrong order, deduped repeat
    jurors, and pushed stake PDAs for unfilled seat sentinels).

- [#27](https://github.com/xeroc/accord/pull/27) [`190145b`](https://github.com/xeroc/accord/commit/190145b334e91295be7a8dc174f79758adb9ec1a) Thanks [@xeroc](https://github.com/xeroc)! - evidence-daemon + sdk: trace ingest authentication (ADR-0037, bean accord-sith) — `@useaccord/sdk/evidence` gains the shared ADR-0037 wire contract `canonicalJson` / `buildTraceBatchMessage` / `verifyTraceBatchSig` (Ed25519 by the juror hot key over sha256 of the canonical batch JSON, one implementation shared by the jurat signer and the daemon verifier); the daemon pipeline now gates in order: envelope shape → signature verify (403) → live `Round.jurors[]` membership via the same chain reader as delivery (403) → `seq <= last` idempotent 200 no-op (new `TraceStore.lastSeq`, fs last-line / s3 max-seq-key) → append → fan-out callback seam. Store write failure logs and still fans out. Batch caps unchanged (64 events / 256 KiB). The lockstep bump for the rest of the workspace comes from the fixed group.

- [#27](https://github.com/xeroc/accord/pull/27) [`0fa8f0e`](https://github.com/xeroc/accord/commit/0fa8f0e9b6d111972326a9046ef3eebb9ac4c110) Thanks [@xeroc](https://github.com/xeroc)! - evidence-daemon: `POST /trace/:subaccord/:dispute/:juror` route + `TRACE_ENABLED` config wiring (ADR-0037, bean accord-lmcc) — ADDRESS-guards on all three path params, 256 KiB body cap measured on raw body bytes (no Content-Length trust), envelope shape + 64-event cap + durable append in the new `src/pipeline/trace.ts` ingest over the TraceStore seam (bean accord-flxc), wired through `WireDeps.traceStore` → `ServerDeps.traceIngest` → `createApp({ traceEnabled })`. Default off (`TRACE_ENABLED=false` ⇒ 404 before any validation or store touch); the Ed25519 sig verify + live `Round.jurors[]` gate land with accord-sith. The lockstep bump for the rest of the workspace comes from the fixed group.

- [#27](https://github.com/xeroc/accord/pull/27) [`9dda16e`](https://github.com/xeroc/accord/commit/9dda16e271aeb2af7e70c7c3bf4602356bf02f78) Thanks [@xeroc](https://github.com/xeroc)! - evidence-daemon: durable TraceStore seam for jury telemetry (ADR-0037, bean accord-flxc) — `src/store/trace.ts` trait (`appendBatch` / `readEvents(dispute, juror?, fromSeq?)` with verbatim-event invariants), FsTraceStore (append-only JSONL `traces/{sub}/{dispute}/{juror}.jsonl`, seq-check-on-append idempotency) and S3TraceStore (one immutable object per batch at `traces/{sub}/{dispute}/{juror}/{seq}.json`, Head-first same-seq no-op, replay = paginated prefix list + sort). Store-only — the ingest pipeline and HTTP routes land with accord-sith/accord-lmcc; the lockstep bump for the rest of the workspace comes from the fixed group.

- [#28](https://github.com/xeroc/accord/pull/28) [`f06c7ab`](https://github.com/xeroc/accord/commit/f06c7ab75ef5ff48986897f3583d46a8b5b2b85f) Thanks [@xeroc](https://github.com/xeroc)! - Docker images (bean accord-a8a9):

  - New `apps/jurat/Dockerfile` — jurat juror-daemon image (same workspace pnpm
    - `pnpm deploy` + bun-runtime pattern as the cranker), built and pushed by
      the Release workflow as `ghcr.io/xeroc/useaccord-jurat`.
  - Cranker/evidence-daemon Dockerfiles: copy EVERY lockfile importer's
    manifest again — `packages/ui`, `apps/{canon,synod,hanse,pitch,remotion,jurat}`
    were missing, so `pnpm install --frozen-lockfile` failed at the deps stage.
  - `.dockerignore`: jurat added to the root-context builds; manifest-only
    members' sources excluded from the context.

- [#27](https://github.com/xeroc/accord/pull/27) [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302) Thanks [@xeroc](https://github.com/xeroc)! - Re-anchor round windows at the last state change (ADR-0038, bean accord-9952)

  - `commit` (panel-full) re-anchors `Round.reveal_end` shrink-only to
    `now + reveal_window` — revealers get the full reveal window from the LAST
    commitment, not from the scheduled `commit_end`.
  - `finalize_round` (early resolve, all revealed) pins `reveal_end = now` —
    the appeal window opens at resolution. The timeout path never extends it.
  - Every deadline consumer (`appeal`, `finalize_dispute`, `cancel_dispute`)
    anchors at the re-anchored `reveal_end`, so an eager panel reaches `Final`
    at `resolve_ts + appeal_window` instead of idling out the scheduled
    commit+reveal span (devnet repro: Inveigo arena court, 1s/12h/12h/30s,
    ~24h → ~40s). No account-layout, IDL, or SDK-signature change.
  - e2e harness: new shared `warpToRevealWindow` (draw-harness + appeal.spec
    local) replaces the `warpTo(commitEnd)` reveal warps; jurat duty tracker
    header documents the live-field requirement + a phase test pins it.

- Updated dependencies [[`e6eaa63`](https://github.com/xeroc/accord/commit/e6eaa632eb273735d12b0896963a62550ac98872), [`190145b`](https://github.com/xeroc/accord/commit/190145b334e91295be7a8dc174f79758adb9ec1a), [`41da6ad`](https://github.com/xeroc/accord/commit/41da6aded4f0cae24e6d8de68b1bab4fdd788302)]:
  - @useaccord/sdk@0.8.0
  - @useaccord/synod@0.8.0

## 0.7.0

### Minor Changes

- [#24](https://github.com/xeroc/accord/pull/24) [`d22f72d`](https://github.com/xeroc/accord/commit/d22f72d716875bb9d441f19f70b387f5790d4286) Thanks [@xeroc](https://github.com/xeroc)! - Domain CAS sub-documents: `PUT /domains/{ref}/{doc}?subaccord=<addr>` + `GET /domains/{ref}/{doc}`. Per-item public docs namespaced under an anchor Subaccord's `domain_ref` (e.g. an Arbitrable's per-thesis docs under its shared court — identity/proof mode pin one doc per domain_ref and cannot host per-item docs). Content-addressed (`sha256(body) == doc`, no proof mode), chain-anchored (`domain_ref == ref`, same create-first poll), dual-written to the bare `domains/{sha256(body)}` key so bare-hash fetch keeps working. Open namespace by design — abuse bounds: per-IP rate limit, per-doc cap, forever retention.

### Patch Changes

- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79)]:
  - @useaccord/sdk@0.7.0
  - @useaccord/synod@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`71dafcb`](https://github.com/xeroc/accord/commit/71dafcb4f42fba11cb5629226baee99f3ea43fdd), [`1e4ad2e`](https://github.com/xeroc/accord/commit/1e4ad2ee4c7b08516392d84100bc9317c8728b79), [`a23b1d2`](https://github.com/xeroc/accord/commit/a23b1d20aa7a8de469594546b8e9a60cf86977f5)]:
  - @useaccord/sdk@0.6.0
  - @useaccord/synod@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.5.2
  - @useaccord/synod@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.5.1
  - @useaccord/synod@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.5.0
  - @useaccord/synod@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.4.0
  - @useaccord/synod@0.4.0

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number
- Updated dependencies [[`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8)]:
  - @useaccord/sdk@0.3.1
  - @useaccord/synod@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`6b5e6b8`](https://github.com/xeroc/accord/commit/6b5e6b8b2097f26c23820699802cb53afd28a990)]:
  - @useaccord/sdk@0.3.0
  - @useaccord/synod@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.2.1
  - @useaccord/synod@0.2.1

## 0.2.0

### Minor Changes

- intial changeset release

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.2.0
  - @useaccord/synod@0.2.0
