---
# accord-tzmm
title: Implement composition root main.ts (wire all modules)
status: todo
type: task
priority: high
created_at: 2026-08-06T20:29:45Z
updated_at: 2026-08-06T20:29:45Z
parent: accord-s3ow
blocking:
  - accord-xh6n
blocked_by:
  - accord-h1v2
  - accord-udiu
  - accord-r9km
  - accord-4swo
  - accord-dyf0
---

---

assigned: implementer

---

## Composition root (currently a 1-line comment)

`src/main.ts` is the **only** module whose job is to instantiate and wire every other module. It is currently:

```ts
/** Wiring entry point: config -> keyring -> store -> chain reader -> server. */
```

Without it, nothing starts — the daemon is a library of unconnected modules. REVIEW item 9 lists it as an empty placeholder.

## Wiring (SPEC §Module layout)

```ts
import { loadConfig } from "./config";
import { EnvKeyring } from "./keys/keyring";
import { S3Store } from "./store/s3"; // accord-udiu
import { ChainReader } from "./chain/reader"; // accord-h1v2
import { ingestHandler } from "./pipeline/ingest"; // accord-r9km
import { deliverHandler } from "./pipeline/deliver"; // accord-4swo
import { createServer } from "./server/app"; // accord-dyf0

const cfg = loadConfig();
const keyring = EnvKeyring.fromEnv(cfg.keyring);
const store = new S3Store(cfg.s3);
const chain = new ChainReader(cfg.rpcUrl, cfg.programId);

const app = createServer({
  keyring,
  store,
  chain,
  rateLimitPerMin: cfg.rateLimitPerMin,
  maxEvidenceBytes: cfg.maxEvidenceBytes,
});
app.listen(cfg.port, { tls: cfg.tls });
```

Notes:

- Stateless — no singletons beyond process scope. HA-ready: N replicas share the same `EVIDENCE_KEYRING` env + S3 bucket.
- `ChainReader` constructor takes `rpcUrl` + `programId` (read-only); it builds its own `createSolanaRpc` internally — do NOT pass a facade (the SDK's `fetchX` break over a raw RPC, see accord-h1v2).
- No graceful-shutdown ceremony for v1 (Bun handles SIGTERM; stateless means no drain needed beyond the LB).

## DoD

- [ ] `bun run src/main.ts` with full env starts the server and listens on `EVIDENCE_PORT`.
- [ ] Missing required env → loud `loadConfig` throw (already covered by accord-qycb for the keyring case).
- [ ] `/healthz` responds 200 (or 503 if S3/RPC down).
- [ ] This is the thing the Dockerfile (accord-3jwq) actually runs.

Blocks e2e (accord-xh6n) — you can't e2e a daemon that doesn't start.

See milestone accord-yjno HANDOFF §1 (happy path) for the end-to-end flow this wires.
