---
"@useaccord/jurat": patch
---

jurat: reveal immediately when the operator's commit completes the panel — the pre-commit `commit_count + 1 === juror_count` case now sends the reveal tx in the same duty pass instead of waiting for the commit window to elapse (on-chain reveal early-open already admits it).
