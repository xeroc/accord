---
# accord-ga1b
title: Scaffold apps/jurat
status: completed
type: task
created_at: 2026-10-15T07:32:40Z
updated_at: 2026-10-15T08:05:00Z
parent: accord-sozc
---


## Summary of Changes

- `apps/jurat/package.json` — private `@useaccord/jurat` v0.3.0 (lockstep), scripts mirroring apps/cranker (`build` = `tsc --noEmit`, `lint`/`lint:fix` = eslint, `start`/`dev` = bun on `src/main.ts`), no runtime deps yet (config/chain are sibling beans).
- `apps/jurat/tsconfig.json` — extends `tsconfig.base.json`, same shape as cranker (`types: ["bun"]`, `noEmit`).
- `apps/jurat/eslint.config.js` + `.prettierrc.json` — verbatim cranker configs (tseslint recommended + prettier).
- `apps/jurat/src/main.ts` — composition-root skeleton: `main()` + `import.meta.main` entry; module wiring lands with accord-jxpn / accord-lii9.
- `apps/jurat/.gitignore`, `pnpm-lock.yaml` — workspace link for the new package.

AC verified: `pnpm -r run build` green, `pnpm -r run lint` exit 0, `bun run src/main.ts` boots and exits; no generated/codegen files touched. Changeset + fixed-group entry intentionally omitted, matching scaffold precedent (hanse a314aafa, synod-app eebe410f — fixed-group wiring is central, 54950cbb).
pnpm-private package @useaccord/jurat, tsconfig from tsconfig.base.json, eslint+prettier (match apps/cranker), src/main.ts composition root skeleton, .gitignore. AC: pnpm -r build + lint green; make codegen untouched.
