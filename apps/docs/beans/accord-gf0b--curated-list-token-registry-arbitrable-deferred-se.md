---
# accord-gf0b
title: Curated-list / token-registry Arbitrable (DEFERRED — see CURATED-LIST.md)
status: draft
type: epic
priority: deferred
created_at: 2026-08-06T03:47:45Z
updated_at: 2026-08-06T03:47:45Z
---

## Status: DEFERRED — separate grilling / speccing / planning session

Full context compiled in **`./CURATED-LIST.md`** (42KB seed document for the future session). This bean is the discoverability pointer so the work is findable from `beans list`.

## Thesis (do NOT re-litigate in the protocol)

A curated-list / token-registry is a **separate program** (an *Arbitrable*) that calls Accord via CPI — **NOT** a Subaccord/court configuration. **Accord Core is unchanged.** The registry owns the item lifecycle + item deposits; when an item is challenged it calls `create_dispute(options=[list/remove], …)` and reads `get_ruling` to flip item status. Two stake pools separate: juror stake in Accord; item deposits in the registry. Single-filer fit (the registry program is the filer — ADR-0004). **This is a PRODUCT decision, not a protocol decision.**

## Dependencies / related beans

- `accord-s72c` (two-party filing with stake) — the submitter-vs-challenger deposit logic likely lives in the **registry program**, not Accord Core. Open question Q-m: does the registry even need two-party filing, or does single-filer suffice?
- `accord-ayqq` (IRV) — not needed; list/remove is binary → Plurality.

## Open questions for the grilling (see CURATED-LIST.md §7 — none resolved)

naming · build-it-ourselves vs enable-third-party · registry state machine · Stake-Curate vs classic refundable TCR · ATQ code-as-item scaling · fee-payer · ruling→item-status + deposit-redistribution mapping · evidence-format options (list/remove) · distribution (wallet snap / explorer / DEX) + the wallet/foundation-support dependency · incentive design (USDC, liquidity-tiered, ROI gates, juror cold-start subsidy) · 60/40 automated-vs-subjective split (positioning vs Token Sniffer / Token-2022) · removals-at-launch · badges/tiers as separate Subaccords · the Jupiter/VRFD play.

## Authority

`./CURATED-LIST.md` · beachhead research (`local://beachhead-curated-lists-nft.md`) · Kleros blog audit (`agent://KlerosProducts`, `agent://KlerosGTM`, `agent://KlerosLessons`)
