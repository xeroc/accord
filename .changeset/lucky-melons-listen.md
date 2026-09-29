---
"@useaccord/app": minor
"@useaccord/canon-app": minor
"@useaccord/synod-app": minor
---

evidence: daemon URL and operator pubkey follow the selected cluster, configurable per cluster via Vite env — `VITE_EVIDENCE_DAEMON_URL_{DEVNET,MAINNET,LOCALNET}` (defaults: `api.devnet.useaccord.xyz` for devnet, `api.useaccord.xyz` for mainnet, devnet's value for localnet) and `VITE_EVIDENCE_OPERATOR[_ADDRESS]_{DEVNET,MAINNET,LOCALNET}` (default: unset = no operator, localnet falls back to devnet's); replaces the single build-time `VITE_EVIDENCE_DAEMON_URL` / `VITE_EVIDENCE_OPERATOR[_ADDRESS]`
