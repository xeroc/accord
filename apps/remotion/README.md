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

## Score-driven audio — no audio binaries in the repo

Background music is authored as Strudel code and prebaked to a wav **build
artifact** (gitignored, like `out/`) before rendering. The artifact is
strudel's own output, relayed verbatim — mix level, headroom and any fades
are authored in the score (`.gain`, `.release`), never post-processed. The
CLI warns when the direct render peaks at full scale (clipping).

```
audio/<name>.strudel            the score — pasteable into https://strudel.cc
public/audio/<name>.wav         artifact — regenerated, never committed
src/cli/score.ts                `score` command: offline-render + relay verbatim
```

```bash
pnpm --filter @useaccord/remotion score my-score 30   # name + seconds
pnpm --filter @useaccord/remotion score --stale       # re-render only changed scores
```

`render` and `studio` chain `score --stale` automatically: after editing a
score, the next render/studio run re-bakes it (needs network); unchanged
scores are skipped in under a second.

In a video (Html5Audio = the plain HTML5-element path; needs remotion ≥
4.0.514, which introduced the export):

```tsx
import { Html5Audio, staticFile } from "remotion";

<Html5Audio src={staticFile("audio/my-score.wav")} volume={0.1} />
```

- The score's `setcpm` is parsed by the command; pass the composition length
  in seconds as the second argument (defaults to 30).
- Sync is time-based by construction: score grid (e.g. 30 cpm → 2s bars) ↔
  composition seconds ↔ frames.
- Runs entirely in Node (`node-web-audio-api` backs the engine's WebAudio
  calls; no browser involved). Needs network once per render: sample
  manifests load from raw.githubusercontent.com. Silence-guarded — a failed
  render errors loudly instead of producing a muted wav.
- `@strudel/web` is AGPL-3.0: fine for internal build tooling, and the
  wav/mp4 output is your own music — revisit before distributing this
  package's code.

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

The brand layer and the mechanism pieces live **in `@useaccord/ui`**
(shared with the landing page and the app); the video-specific staging
stays in this framework. `grep` these before writing scene-local code:

| Need | Import | Notes |
|---|---|---|
| Brand-eased enter/exit | `src/shell/anim` — `enterAt`, `exitAt`, `clamp`, `since`, `scramble` | Seconds-based motion math for scenes. No hand-rolled `interpolate(..., {easing: EASE_EXPO, clamp, clamp})`. |
| Scene frame | `src/shell/scene` — `Scene`, `Beat` | `Scene seed stack` = shared `Backdrop` + centered column (`p-16`, gap via className). `Beat` = mechanism step chrome. |
| Moving backdrop | `src/shell/backdrop` — `Backdrop seed` | Thin adapter: feeds `useCurrentFrame()` to the kit's frame-driven `Backdrop`. Do not fork it. |
| The Accord mark | `@useaccord/ui` — `AccordMark` | The 3-line house mark. `progress` animates the draw-on. Never redraw the glyph. |
| Wordmark / rule | `@useaccord/ui` — `Wordmark`, `AmberRule` | Progress-driven (0→1), sizing via className. |
| Step chrome | `src/shell/rail` — `StepRail`, `PhaseCaptions` | Ordered labels, active step amber. |
| Mechanism pieces | `@useaccord/ui` — `JurorPool`, `SealedVote`, `RulingStamp`, `MonoChip`, `DeltaChip`, `TallyBar` | **Frame-prop contract**: pass the scene's `frame` (they are pure functions of it — that's what lets the landing page run them on a wall clock). |
| Coin arc | `src/pieces/coin` — `Coin` | Video-only staging: absolute 1920×1080 canvas arcs. |

Contract: kit pieces take `frame` (or 0→1 progress) explicitly — no
Remotion hooks inside the kit. Components render plain divs; wrap in
`Interactive.Div` in the scene when you want a Studio label.

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
