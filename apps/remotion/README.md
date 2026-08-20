# @useaccord/remotion — the Accord video framework

One Remotion 4 framework, many videos. Every video obeys `@useaccord/ui`
(the design tokens, fonts, and components the dApps use), can mount **real
`apps/app` feature views** over deterministic seeded data, and lives as a
self-contained directory under `videos/`. Videos are **local-only**: only
`videos/_example` (reference) and `videos/_template` (scaffold) are tracked
— everything else under `videos/` is gitignored.

```
apps/remotion/
  remotion.config.ts        webpack config override (PostCSS!) + entry point
  postcss.config.js         @tailwindcss/postcss — the Tailwind v4 engine
  src/
    index.ts                registerRoot + theme.css import (the entry)
    Root.tsx                one <Folder><Composition/> per video (from manifest)
    videos.gen.ts           GENERATED manifest (gitignored; never hand-edit)
    framework/video.ts      defineVideo() — the per-video contract
    shell/theme.css         Tailwind wiring, identical to apps/app/src/index.css
    shell/stage.tsx         <Stage> — ink canvas + fonts-ready render gate
    shell/presets.ts        EASE_EXPO (brand curve) + SPRING feels
    appstage/app-harness.tsx  AppHarness — real app views, seeded data
    appstage/fixtures.ts    makeDispute() display fixtures
    cli/                    `sync` (manifest) + `new` (scaffold)
  videos/
    _example/               tracked reference video — read it first
    _template/              scaffold source for `pnpm new <slug>`
    <your-slug>/            your videos — never committed
  public/                   static assets (staticFile("...") targets)
```

## Commands

```bash
pnpm --filter @useaccord/remotion new <slug>    # scaffold videos/<slug>/ + regen manifest
pnpm --filter @useaccord/remotion studio        # preview all videos (http://localhost:3000)
pnpm --filter @useaccord/remotion render <id> out/<id>.mp4
pnpm --filter @useaccord/remotion still <id> out/frame.png --frame=<n>
pnpm --filter @useaccord/remotion sync          # regenerate src/videos.gen.ts
pnpm --filter @useaccord/remotion test          # vitest (framework contract tests)
```

Every command (build/lint/test/studio/render) regenerates the manifest
first, so a freshly created video dir is picked up automatically.

This machine has no Remotion-managed Chrome; pass the system browser:

```bash
pnpm --filter @useaccord/remotion exec remotion render <id> out/<id>.mp4 --browser-executable /usr/bin/chromium
```

## Creating a video

1. `pnpm --filter @useaccord/remotion new my-video`
2. Edit `videos/my-video/index.tsx` and add scenes under `videos/my-video/scenes/`.
3. `pnpm --filter @useaccord/remotion studio` → pick composition `my-video`.

The contract (see `src/framework/video.ts`):

```tsx
import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";

export const video = defineVideo({
  id: "my-video",            // letters/numbers/hyphens only (Remotion rule)
  component: MyVideo,        // scenes are <Sequence>s inside, wrapped in <Stage>
  fps: 30,
  width: 1920,               // 1920x1080 renders app-density UI 1:1
  height: 1080,
  durationInFrames: 30 * 20, // 20s
});

function MyVideo() {
  return (
    <Stage>
      {/* <Sequence> per scene */}
    </Stage>
  );
}
```

Rules that are enforced by convention — follow them:

- **Import paths:** framework modules are `../../src/...` from
  `videos/<slug>/index.tsx` and `../../../src/...` from
  `videos/<slug>/scenes/*.tsx`. App views are
  `../../../../app/src/features/...` from scenes.
- **Slug = directory name**, kebab-case. The composition `id` may differ
  (it is what Studio and `render` use).
- Assets: put them in `videos/<slug>/` or `public/` and reference via
  `staticFile()` — never `import` binary media.
- Never commit anything under `videos/` except `_example`/`_template` —
  the `.gitignore` already enforces this.

## Obedience to @useaccord/ui (non-negotiable)

- **Use the real components** — `Button`, `Card`, `Badge`,
  `DisputeStatusCard`, `Table`, … — imported from `@useaccord/ui`. No
  lookalike HTML, no hand-rolled colors. A brand change in the kit
  re-skins every video on rebuild.
- **Tokens only**: `bg-background`, `bg-ink`, `bg-raised`, `text-amber`,
  `text-text-secondary`, `border-border-subtle`, `font-mono`,
  `font-heading`, … Never literal hex values.
- The theme comes from `src/shell/theme.css` (imported by `src/index.ts`),
  which mirrors `apps/app/src/index.css` exactly. Do not import Tailwind
  or the ui stylesheet per-video — it is already wired.
- Motion language: `EASE_EXPO` and `SPRING` from `src/shell/presets.ts`
  are the brand curve — the Remotion twin of the kit's `EASE_EXPO`.

## Shared vocabulary (use these, don't hand-roll them)

Videos kept re-implementing the same elements; they now live in the
framework. `grep` these before writing scene-local code:

| Need | Import | Notes |
|---|---|---|
| Brand-eased enter/exit | `src/shell/anim` — `enterAt`, `exitAt`, `clamp`, `since`, `scramble` | The sanctioned way to write motion. No hand-rolled `interpolate(..., {easing: EASE_EXPO, clamp, clamp})` — use `enterAt(frame, fps, delaySec, durSec)`. `clamp` spreads into the rare multi-segment `interpolate`. |
| Scene frame | `src/shell/scene` — `Scene`, `Beat` | `Scene seed stack` = shared `Backdrop` + centered column (`p-16`, gap via className). `Beat` = mechanism step chrome (visual center, copy bottom). |
| Moving backdrop | `src/shell/backdrop` — `Backdrop seed` | The one backdrop: ledger grid + juror field + verdict glow + vignette. All videos use it — do not fork it. |
| The Accord mark | `src/shell/brand` — `AccordMark` | The 3-line mark (two diagonals + one vertical converging on a dot) — same geometry as the app navbar. `progress`/`dot` animate it. Never redraw the glyph. |
| Wordmark / rule | `src/shell/brand` — `Wordmark`, `AmberRule` | Progress-driven (0→1), sizing via className. |
| Step chrome | `src/shell/rail` — `StepRail`, `PhaseCaptions` | Ordered labels, active step amber. |
| Juror pool dots | `src/pieces/juror-pool` — `JurorPool` | `drawnAt(dot)` pops dots amber; `fadeAt` retires the pool. |
| Commit→reveal slot | `src/pieces/sealed-vote` — `SealedVote` | Hash scrambles in, locks, flips to the vote; optional tone + cross-out. |
| Ruling stamp | `src/pieces/ruling-stamp` — `RulingStamp` | Slams in at `at` (1.6×, −4°→−2°, amber glow). |
| Chips | `src/pieces/chips` — `MonoChip`, `DeltaChip` | Tone = amber/confirm/slash/neutral; size via className (cn-merged, overrides win). |
| Tally / coin arc | `src/pieces/tally` — `TallyBar`, `Coin` | Vote-count bar; amber token arcing between two points. |

Presentational contract: brand pieces take 0→1 progress values (no
frame hooks inside); pieces that own their choreography take `at`
frames and read `useCurrentFrame()` themselves. Components render
plain divs — wrap in `Interactive.Div` in the scene when you want a
Studio label.

## Showing real app flows — AppStage

Mount actual `apps/app` views inside the deterministic harness
(`src/appstage/app-harness.tsx`): ConnectorKit `AppProvider` (localnet,
never contacted) + react-query with a **pre-seeded cache** +
`MemoryRouter` + `MotionConfig reducedMotion="always"`.

```tsx
import { DisputeList } from "../../../../app/src/features/dispute/DisputeList";
import { AppHarness } from "../../../src/appstage/app-harness";
import { makeDispute } from "../../../src/appstage/fixtures";
import { DisputeState } from "@useaccord/sdk";

<AppHarness route="/disputes" seed={{ disputes: [
  makeDispute({ address: "…", filer: "…", state: DisputeState.Commit }),
  makeDispute({ address: "…", state: DisputeState.Final, finalRuling: 1n, currentRound: 1 }),
]}>
  <DisputeList />
</AppHarness>
```

- Seed keys mirror the app hooks exactly (`["disputes", endpoint]`,
  `["dispute", address, endpoint]` — endpoint is the harness localnet
  constant `HARNESS_ENDPOINT`). Extend `HarnessSeed` in the harness when
  you need more hooks (`round`, `subaccord`, …) — keep the app's
  `queryKey` shape byte-for-byte.
- Data is captured at mount: **change data across scenes by remounting**
  (a new `<Sequence>` boundary or an explicit `key`), never by mutating.
- Wallet interactions never really sign. Choreograph "the user clicked X"
  as a scene cut over newly seeded state.
- `reducedMotion="always"` freezes the kit's wall-clock motion presets;
  drive all visible animation yourself from `useCurrentFrame()`.

**App-view import constraints** (webpack bundler, not Vite):

- Do not import modules that read `import.meta.env` —
  `apps/app/src/providers.tsx`, `shared/cluster.ts`,
  `features/dispute/evidence/config.ts`, `features/subaccord/createForm.ts`.
  Webpack does not provide the Vite env shim. The harness replaces
  `providers.tsx`; the others are read-paths you don't need.
- Views using the `@/` alias compile because our `tsconfig.json` maps
  `@/*` with an `../app/src/*` fallback — but at *runtime* webpack does
  not resolve that fallback, so prefer views whose imports are relative
  (DisputeList and friends are).

## Determinism rules

Renders must be reproducible frame-by-frame:

- Animate from `useCurrentFrame()` / `useVideoConfig()` with `interpolate`
  (clamp both ends) or `spring({ frame, fps, config: … })`. Never
  `setTimeout`, `Date.now`, CSS keyframe animations, or wall-clock
  `motion` components.
- Randomness only via Remotion's `random(seed)`.
- Async (data, fonts, images) only through `delayRender`/`continueRender`
  (the `<Stage>` fonts gate already does this) or in
  `calculateMetadata`.
- 1920x1080@30 is the default; override per-video in `defineVideo`.

## How the framework works (maintenance notes)

- **Manifest**: `src/cli/sync.ts` scans `videos/*/` for `index.ts(x)`,
  validates names, and writes `src/videos.gen.ts` with static imports
  (Remotion's bundler cannot discover directories at runtime). The file
  is gitignored; CI regenerates it from the tracked dirs alone. Deleting
  it is safe — any script command recreates it.
- **Tailwind via PostCSS**: Remotion's webpack CSS chain is
  style-loader → css-loader with **no PostCSS stage**
  (`@remotion/bundler` `getSharedModuleRules`). `remotion.config.ts`
  therefore appends `postcss-loader` to the CSS rule (loader order is
  right-to-left: appended = runs first). `postcss.config.js` must stay a
  `.js` file at the package root — `.mjs` is not discovered, and the
  config silently not applying yields transparent/black frames.
- **Fonts**: Fontsource CSS from the ui kit loads async in headless
  Chrome; `<Stage>` gates the first frame on `document.fonts.ready`.
- **Bundle output** is `build/` (gitignored via the root `build` pattern).

## Tests

`pnpm --filter @useaccord/remotion test` — vitest + jsdom:

- `src/cli/sync.test.ts` — manifest scanning/rendering contract.
- `src/appstage/app-harness.test.tsx` — proves a real `apps/app` view
  (`DisputeList`) renders from the seeded cache with zero network.

Both are framework contract tests; individual videos do not carry tests.
