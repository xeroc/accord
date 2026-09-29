---
"@useaccord/app": minor
"@useaccord/canon-app": minor
"@useaccord/synod-app": minor
---

evidence: daemon URL follows the selected cluster, configurable per cluster via `VITE_EVIDENCE_DAEMON_URL_{DEVNET,MAINNET,LOCALNET}` (defaults: `api.devnet.useaccord.xyz` for devnet, `api.useaccord.xyz` for mainnet, devnet's value for localnet); replaces the single build-time `VITE_EVIDENCE_DAEMON_URL`
