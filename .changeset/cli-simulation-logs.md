---
"@useaccord/cli": patch
---

`useaccord` now dumps the full validator log lines whenever a transaction fails simulation — human mode prints a `transaction logs:` block on stderr, `--json` includes a `logs` array. Kit ≥7's preflight `SolanaError` shape (program code on a nested cause, logs in context) is decoded, so failed sends map back to their Accord error names instead of a bare "Transaction simulation failed".
