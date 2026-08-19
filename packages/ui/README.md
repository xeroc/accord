# @useaccord/ui

Shared design tokens, Tailwind v4 theme, and React UI primitives for the
Accord applications (`apps/app`, `apps/canon`, `apps/synod`, `apps/landing`).

Private workspace package, consumed via `"@useaccord/ui": "workspace:*"`.
Not published — licensing and release strategy are unresolved.

## Install (workspace app)

```jsonc
// apps/<app>/package.json
"dependencies": { "@useaccord/ui": "workspace:*" }
```

```css
/* apps/<app>/src/index.css — the app owns the Tailwind engine */
@import "tailwindcss";
@import "tw-animate-css";
@import "@useaccord/ui/styles.css";

/* Release blocker: make Tailwind scan package source for utility strings.
   Path is relative to this CSS file (apps/<app>/src/index.css → repo root). */
@source "../../../packages/ui/src";
```

`styles.css` imports the IBM Plex Fontsource weights (the Fontsource
packages are dependencies of `@useaccord/ui`) — apps no longer import fonts
themselves.

Keep SPA shell rules app-local (`html, body, #root { height: 100% }`).

## Tokens only (non-React consumers)

```css
@import "@useaccord/ui/tokens.css"; /* raw --accord-* values, no fonts, no base */
```

## Usage

```tsx
import { Button, Dialog, Select, Toaster } from "@useaccord/ui";
```

## Package boundary — enforced

The package MUST NOT depend on or import:

- `@solana/*`, `@useaccord/sdk`, `@useaccord/canon`, `@useaccord/synod`
- `react-router-dom`, `@tanstack/react-query`
- `import.meta.env`

Applications own routes, links, wallets, data fetching, env vars, product
copy, and logos. If a module needs them, it stays in the app (or behind a
slot/`ReactNode` prop).

## Development

```bash
pnpm --filter @useaccord/ui build   # tsup + tsc declarations + CSS copy
pnpm --filter @useaccord/ui lint    # tsc --noEmit
pnpm --filter @useaccord/ui test    # vitest (jsdom + Testing Library)
pnpm --filter @useaccord/ui storybook
pnpm --filter @useaccord/ui build-storybook
```

Stories and tests are colocated: `src/primitives/button.stories.tsx`,
`button.test.tsx`.

## shadcn workflow

`packages/ui` is the canonical shadcn owner (`components.json` lives here).
Add new primitives from the package directory:

```bash
cd packages/ui && pnpm dlx shadcn@latest add <primitive>
```

Fix generated imports to package-relative form (`../internal/cn`), export
from `src/index.ts`, add a story + tests, then migrate consumers.
Applications must not regenerate package-owned primitives locally.

## Tokens

Canonical values live once in `src/styles/tokens.css` (`--accord-*` raw
values). `theme.css` maps them onto Tailwind `@theme` / shadcn semantic
names; `base.css` holds opt-in global rules; `styles.css` aggregates all
three plus Fontsource imports. Dark is the only theme — no ThemeProvider,
no runtime theming (see UI-KIT-PLAN.md §7).

## Patterns (composed, slot-based)

`src/patterns/` holds proven cross-app compositions. Interfaces stay
domain-neutral — apps supply meaning via slots:

- `ProductNavbar` — sticky header shell (`brand`, `navigation?`,
  `accountControls?`, `mobileNavigation?`). Wallet/cluster controls stay
  app-side: the kit must not import `@solana/connector`.
- `PageShell` — `header` slot + the shared `main` container.
- `PageTransition` — keyed route-fade wrapper (`transitionKey`); never
  imports the router.
- `DisputeStatusCard` — display-only `{ title?, rows, action?, note? }`.
  Apps keep SDK decode, formatting, and the `VITE_ACCORD_APP_URL` deep link.

## Recorded decisions

- **Skeleton** — the shadcn primitive (`ui/skeleton.tsx`) is `Skeleton`. The
  old custom `components/Skeleton.tsx` (aria-hidden, `rounded-sm bg-border`)
  had 8 call sites using only `style` props; each migrated to the kit
  primitive with explicit `className="rounded-sm bg-border"` +
  `aria-hidden` (tailwind-merge preserves the old visual). The old files are
  deleted. `apps/canon/src/features/evidence/DisputeStatusCard.tsx` is a
  separate self-fetching widget with different markup — deliberately local.
- **`cn`, `buttonVariants`, `badgeVariants`** — module-internal; no app call
  sites use them. Re-export deliberately if that changes.
- **Fonts** — `@useaccord/ui` owns the Fontsource imports via `styles.css`;
  `tokens.css` stays font-asset-free for non-React consumers.

## Deferred work (do NOT smuggle into this package)

- Shared wallet/cluster/format runtime helpers (`apps/*/src/shared/*`,
  navbar account controls) → possible `@useaccord/app-runtime` or SDK-level
  module; separate audit.
- External publication: licensing (root is UNLICENSED), semver policy,
  Changesets, tarball-in-clean-consumer verification.
- Runtime light/dark theming, Chromatic, a separate tokens package.
