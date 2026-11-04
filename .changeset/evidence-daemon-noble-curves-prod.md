---
"@useaccord/evidence-daemon": patch
---

Fix production image crash on boot. `trace-token.ts` imports
`@noble/curves/ed25519` at runtime (ADR-0037 trace tokens), but
`@noble/curves` sat in `devDependencies` — `pnpm deploy --prod` pruned it
from the image and Bun died with `Cannot find module
'@noble/curves/ed25519' from '/app/src/server/trace-token.ts'`. Moved to
`dependencies` (it was a devDep from bean accord-5wkt, when the import was
test-side only). Verified by reproducing the failed resolve against
`pnpm deploy --prod` output before, and a clean resolve after.
