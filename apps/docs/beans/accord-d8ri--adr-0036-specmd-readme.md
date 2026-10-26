---
# accord-d8ri
title: ADR-0036 + SPEC.md + README
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T07:32:42Z
parent: accord-qedu
---

apps/docs/adr/accord/0036-jurat-agentic-juror-daemon.md (decision set from milestone body, index.md updated); apps/jurat/SPEC.md (architecture, gates, duty flow, config surface); README quickstart. AC: mkdocs build green; ADR index lists it.

## Summary of Changes

- `apps/docs/adr/accord/0036-jurat-agentic-juror-daemon.md` — full decision set from the grill (milestone accord-g69g): DRY_RUN scope, evidence-fed agent without web tools, conservative join gates, WS-hints + reconcile-truth monitoring, in-process isolation with `runVerdict` Docker seam, Vercel AI SDK stack, ASAP vote timing, clean-abstain failure policy, single-key identity. Format follows the series (Considered Options → Consequences → References).
- `apps/docs/adr/accord/index.md` — row 0036 added; "next sequential" counter bumped to 0036.
- `apps/jurat/SPEC.md` — implementation reference with module-status map (notify landed, rest specified-not-built per the docs-match-reality rule), duty-flow diagram, join-gate table, agent runner seam, notify channel section, full `JURAT_*` config table, failure-mode table, verification plan.
- `apps/jurat/README.md` — quickstart (bun test/build/lint + run), explicit in-construction status banner, safety rails, further reading.

Verification: `cd apps/docs && poetry run mkdocs build` — green ("Documentation built in 10.52 seconds"); ADR index lists 0036.
