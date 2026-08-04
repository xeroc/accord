---
# veridao-qlnn
title: Codama codegen pipeline + generated Kit client
status: todo
type: task
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-04T21:51:39Z
parent: veridao-vxe9
---

Set up the codegen pipeline. Add `codama` CLI + `@codama/renderers-js` to packages/sdk devDeps. Create packages/sdk/codama.json: `{ "idl": "../../target/idl/accord.json", "scripts": { "js": ["@codama/renderers-js"] } }`. Add `make codegen` (anchor build -> codama run js) and `make sdk` targets to Makefile. Run `make codegen` to emit packages/sdk/src/generated/. Acceptance: `make codegen` produces the Kit client (codecs, Ix builders, account fetchers) with no manual edits; a generated instruction builder imports and resolves under tsc. See ADR-0010.
