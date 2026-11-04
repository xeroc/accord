---
"@useaccord/jurat": patch
---

Jurat advances duties concurrently per scan (default 4, `JURAT_MAX_PARALLEL_DUTIES`; 1 restores fully sequential advancement). Previously `handleScan` ran duties strictly one-by-one, so one dispute's slow LLM ladder could eat a sibling duty's commit/reveal window — a starvation hazard, not just a throughput one. Joins stay sequential (budget accounting is order-dependent by design), and file-store saves now chain through a per-store tail so concurrent duty saves cannot lose records (whole-file read-modify-write was last-writer-wins).
