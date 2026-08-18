---
# accord-yrq3
title: 'Dispute detail: plaintext verdict from decoded manifest'
status: completed
type: task
created_at: 2026-08-18T02:04:47Z
updated_at: 2026-08-18T02:04:47Z
---

## Goal

DisputeDetail showed encoded values (option index / hash) as the verdict even when the evidence manifest was decoded and carried plaintext option labels.

## Changes

- formatRuling(ruling, aggregation, labels?) — plurality rulings resolve to manifest label, fall back to Option N
- DisputeDetail: final ruling / round result / bond prior result lead with plaintext label, encoded value demoted to helper detail
- EvidenceManifest card moved into the former Options slot; encoded Options block suppressed when a manifest is decoded (hash list remains the no-manifest fallback; median revealed-scalars unchanged)

## Acceptance

- [x] label override + fallbacks tested (format.test.ts, 3 checks)
- [x] tsc lint clean, vite build green
- [x] full app suite 28/28
