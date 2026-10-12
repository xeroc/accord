# Accord — DESIGN.md

> **Status:** Spec of the implemented system, not a direction brief. This file is the `brand/DESIGN.md` cited in source comments across `packages/ui` (tokens, easing), `apps/landing`, and `apps/canon`. Section numbers are stable — code cites §04 (palette), §05 (type), §08 (surface rules + easing), §10 (bans), §12 (motion).
>
> Sources of truth: `packages/ui/src/styles/tokens.css` (canonical `--accord-*` values — the only place raw hex lives), `packages/ui/src/` (the kit), `apps/landing/src/` (the marketing surface). When this file and the code disagree, the code wins — fix this file in the same change.

## 00 — Overview

Accord is **the Mechanist**. It ships a Solana primitive — `create_dispute()` → `get_ruling()` — that resolves subjective disputes through a Schelling-point court instead of a trusted committee. The audience is **the Integrator**, a protocol engineer who lives in a dark IDE, evaluates tools by reading source, and is allergic to governance theater. Every design decision serves one test: **does this make the mechanism legible, or does it decorate over it?** Ornament loses.

The implemented system is terminal-native: an ink-dominant dark canvas (GitHub-dark-derived neutrals), **IBM Plex Sans** for voice, **IBM Plex Mono** for structure, and one identity accent — **Verdict Amber** `#F0A830`. Dark is the only theme; there is no light mode and no runtime theming.

**Key characteristics:**
- Ink `#0A0E14` ground, raised `#11161D` panels, hairline `#1F2630` rules. Depth comes from tone steps, translucency, and 1px rules — never resting shadows or gradients.
- Amber is the only brand accent: links, eyebrows, inline code identifiers, the primary CTA, the mark. Green and red are **state** colors (finalized / slash), never brand fills.
- Mono is structural, not decorative: every identifier, filename, hash, stat, nav link, and label runs in Plex Mono. Sans carries headlines and running prose.
- Sentence case + period, always ("Mechanize the verdict."). ALL CAPS is reserved for mono eyebrows/labels.
- The mark is convergence: three strokes meeting at one focal point — the Schelling Point rendered as geometry.
- Motion is corporate: zero overshoot on enters, one signature easing curve (`--ease-expo`), springs for choreography, CSS for state changes.

## 01 — Who we're designing for

**Primary — the Integrator** (Solana protocol engineer). Adopts the primitive by committing a CPI call, not by signing up. Lives in dark IDE themes, GitHub, builder Discords. Evaluates by reading the README, the program, the IDL, the tests.

**Secondary — the Juror** (earns by being right, not by governing). Staking/draw/slash dashboards must make the economics readable at a glance.

**Tertiary — the Subaccord Creator** (parameterizes Accord for their own domain). The `create_subaccord()` parameter surface must be self-documenting.

**Explicitly not the audience:** the end user (experiences a verdict *through* an application, never sees Accord directly), consumer-crypto degens, non-Solana/EVM developers, anyone wanting a hosted arbitration service or a human referee.

**Takeaway:** design for a dark IDE open on a second monitor. The README is a primary brand surface; the landing page is legibility, not theater.

## 02 — Identity strategy

Every visual element either *is* the mechanism or gets out of its way. Four principles:

1. **Mechanism over decoration.** If a line, gradient, or flourish carries no information about how Accord works, delete it.
2. **Code is the surface.** Monospace is structural — identifiers, the two CPI calls, stats, labels, and version tags carry typographic primacy.
3. **Dark-first, signal-bright.** Design for the developer's actual environment; reserve amber/green/red exclusively for states that matter.
4. **Convergence as the only sanctioned metaphor.** Nodes, aligning vectors, strokes meeting at one point — as structure (the mark, dividers, diagram spines), never as filler.

## 03 — Logo & brand components

Implemented in `packages/ui/src/brand/` — one geometry, defined once, never redrawn:

- **`AccordMark`** — the house mark: three lines (two diagonals from the top, one vertical from below) converging on a focal point. 32×32 viewBox, `strokeWidth 2.4`, `strokeLinecap "square"`, `currentColor` (defaults `text-amber`). Static by default; `progress` (0→1) animates the line draw-on via `pathLength` dash. One geometry everywhere: app navbars, landing Nav/Footer, videos. Product marks (Canon, Synod) stay app-local.
- **`Wordmark`** — the "Accord" text lockup: typeset (`font-heading font-bold tracking-tight text-nearwhite`), not a drawn logotype (see §11). `enter` (0→1) fades in while settling from `settle` px below. In nav/Footer chrome the lockup is the 20px `AccordMark` + Plex Mono "Accord" at `text-sm font-medium`.
- **`AmberRule`** — the amber hairline under a wordmark: `h-1 w-48 rounded-full bg-amber`, scaling in from center (`enter` 0→1). Width override via className.
- **Favicon / theme-color** — `#0a0e14` (see `apps/landing/index.html`).

All three are progress-driven (0→1) with static-capable defaults — video (Remotion) and web share them.

## 04 — Color

Canonical raw values live once in `packages/ui/src/styles/tokens.css` (`--accord-*`). `theme.css` maps them two ways: brand utility names (`bg-ink`, `text-amber`, …) and the shadcn semantic system (`bg-background`, `text-primary`, …). Never inline hex in a component — use the tokens.

### Core tokens

| Token | Hex | Tailwind name | Role |
|---|---|---|---|
| `--accord-ink` | `#0A0E14` | `bg-ink` / `bg-background` | Primary surface. Cold near-black, faint blue undertone — never pure black. |
| `--accord-raised` | `#11161D` | `bg-raised` / `bg-card` | Cards, code panels, popovers. Amber CTAs sit on raised, not base ink. |
| `--accord-border` | `#1F2630` | `border-border` | Hairlines, dividers, rules. |
| `--accord-amber` | `#F0A830` | `text-amber` / `bg-primary` | **Verdict Amber** — identity accent. Primary CTA fill, links, eyebrows, inline code identifiers, the mark, focus ring. Never a generic warning fill. |
| `--accord-confirm` | `#3FB950` | `text-confirm` / `--success` | State: finalized, commit confirmed, successful CPI. Status dots/badges/vote tones only — never a brand fill, never a CTA. |
| `--accord-slash` | `#F85149` | `text-slash` / `--destructive` | State: slash, incoherence, the antagonist failure mode. Restricted — overuse dilutes it. |
| `--accord-text-primary` | `#E6EDF3` | — | Primary UI text (feature views). |
| `--accord-nearwhite` | `#F0F6FC` | `text-nearwhite` / `text-foreground` | Headlines on dark. |
| `--accord-body` | `#C9D1D9` | `text-body` | Running text on dark. |
| `--accord-text-secondary` | `#8B949E` | `text-muted-foreground` | Secondary text, captions — one secondary gray across both token dialects. |
| `--accord-muted` | `#7D8590` | — | Charts only (`--chart-4`). Not for text. |
| `--accord-paper` | `#F6F7F8` | — | Rare light surface (docs print view). Tokenized, untested (§11). |

Neutral ramp is GitHub-dark-derived — the most legible type/background system for this audience.

### Semantic mapping (shadcn dialect)

`--primary` = amber on `--primary-foreground` = ink · `--destructive` = slash · `--success` = confirm · `--ring` = amber · `--border`/`--input` = border · `--background` = ink · `--card`/`--popover` = raised · `--muted` = raised (bg), `--muted-foreground` = text-secondary. Charts 1–5: amber, confirm, slash, muted, body. Legacy feature-view aliases (`--ink`, `--raised`, `--amber`, `--green`, `--red`, `--text`) point at the shadcn tokens so both dialects coexist.

### Interaction chrome

- **Selection:** amber background, ink text.
- **Focus-visible:** `outline: 2px solid amber; outline-offset: 2px` — plus `focus-visible:ring-3 ring-ring/50` on kit controls.

### Elevation

Tone steps + hairlines at rest: ink ground → raised card (`bg-card` + `ring-1 ring-foreground/10`) → border hairlines. No resting drop shadows, no gradients, no glow. The only sanctioned depth effects are interaction-time (§12: card hover lift + shadow, nav translucency) and the `Backdrop` ambient canvas (§06). **Ring over border for depth** — rings adapt to any background via transparency; borders stay for layout separators (list dividers, input outlines).

### Radius

`--accord-radius: 0.5rem` (8px) drives the whole scale: `rounded-lg` = 8px — the workhorse (buttons, inputs, selects, code panels, callouts); `rounded-xl` ≈ 11px (cards, dialogs, popovers); `rounded-md` ≈ 6.4px steps down the `xs`/`sm` button sizes; `rounded-full` for AmberRule and status dots. No sharp-0px UI, no pill buttons.

### Usage rules

- Amber + ink is the signature pairing; amber is reserved, not liberal.
- Never combine confirm and slash adjacent except inside an explicit mechanism diagram (honest vs. incoherent vote).
- No gradients as surface treatment (the amber→ink hero gradient remains undecided — treat as banned, §11).
- Never amber text on confirm or slash.

## 05 — Typography

Two families, same foundry, same engineered register — **IBM Plex Sans** (voice: headlines, subheads, body, buttons) and **IBM Plex Mono** (structure: code, identifiers, labels, stats, nav). Self-hosted via Fontsource, imported once by `@useaccord/ui/styles.css` (Sans 400/500/600/700, Mono 400/500/600); `tokens.css` stays font-asset-free for non-React consumers. Fallbacks: `ui-sans-serif, system-ui` / `ui-monospace, SFMono-Regular, Menlo`. Body defaults: weight 400, line-height 1.6, antialiased, `text-rendering: optimizeLegibility`.

### Hierarchy (as shipped on `apps/landing`)

| Role | Face / weight | Size | Tracking | Line height | Color |
|---|---|---|---|---|---|
| Hero h1 | Sans 600 | 48 → 60 → 72px (`text-5xl sm:text-6xl md:text-7xl`) | −0.02em | 1.05 | nearwhite |
| Prologue beat lines | Sans 400 | 24 → 30px | 0 | snug | nearwhite |
| Prologue question | Sans 500 | 30 → 36px | 0 | — | amber |
| Section h2 | Sans 500 | 30 → 36px (`text-3xl sm:text-4xl`) | −0.01em | — | nearwhite |
| Closing CTA h2 | Sans 600 | 36 → 48px (`text-4xl sm:text-5xl`) | −0.02em | — | amber |
| h3 | Sans 500 | 18 → 20px | 0 | — | nearwhite |
| Body large | Sans 400 | 18 → 20px | 0 | relaxed | body |
| Body | Sans 400 | 14 → 16px | 0 | relaxed | body |
| Muted note | Sans 400 | 14px | 0 | — | muted-foreground |
| Eyebrow / label | Mono, ALL CAPS | 12px | +0.08em | — | amber (or muted / slash for the antagonist callout) |
| Mono caption | Mono 400 | 12px | 0 | — | muted-foreground (filename labels, footer meta) |
| Nav / footer link | Mono 400–500 | 14px | tight | — | muted-foreground → nearwhite on hover |
| Inline code / identifier | Mono | match body | 0 | — | amber |
| Stat / figure | Mono | match body | 0 | tabular | nearwhite inline in prose |
| Tagline | Sans 500 | 18px | 0 | — | nearwhite, sentence case, **period included** |

### Principles

- **Sentence case + period, always** — headlines and tagline. No all-caps sans; ALL CAPS is reserved for mono eyebrows/labels.
- **Mono is structural:** every on-chain identifier (`create_dispute()`, `stake`, `draw`, `commit`, `reveal`, `appeal`, `finalize`), filename, hash, address, and numeral renders in Plex Mono — inline in body text too. Numbers use tabular figures.
- Code/terminal content sits on a raised `#11161D` panel.
- **Avoid:** Inter/Geist/SF Pro/Helvetica as primary; display serifs; rounded "friendly" grotesques (Nunito, Quicksand, Poppins); script/brush faces; mono as running body face; variable-axis gimmicks.

## 06 — Imagery

**No photography of people, ever.** The mood is schematic and technical — closer to a cryptography whitepaper than marketing photography. The only sanctioned imagery, all implemented as the kit's frame-contract vocabulary (`packages/ui/src/mechanism/`):

- **Mechanism diagrams** — the dispute lifecycle drawn as a schematic (`create_subaccord → stake → draw → commit → reveal → appeal → finalize → get_ruling`), monoline ink + amber, Plex Mono labels. These diagrams *are* the brand imagery: `JurorPool`, `SealedVote`, `TallyBar`, `RulingStamp`, `SortitionRuler`, `MerkleSumTree`, `PanelLadder`, `StateNode`, `VaultBox`, `ChainStrip`, `SubaccordCard`, `LedgerCounter`, `TokenBadge`.
- **Schelling-point visualizations** — distributed juror nodes converging on a single ruling (`JurorPool` + `RulingStamp`, the `RetroBeam`).
- **Terminal / code surfaces** — real code and log lines as hero imagery (the `arbitrable.rs` code frame, §08).
- **Stat callouts as visual objects** — "25%", "$7M", "March 2025" set in Plex Mono, treated as imagery.
- **`Backdrop`** — the shared ambient canvas behind hero sections and video scenes: four deterministic layers (ledger grid — 96px hairline grid drifting diagonally; juror field — seeded dots on slow lissajous drifts, a few pulsing amber; verdict glow — one amber radial orbiting slowly; vignette — ink edges). Pure function of a `frame` counter; the PRNG is a verbatim port of Remotion's `random()` so node fields match the videos exactly.

**The frame contract:** every mechanism component renders exactly what its `frame` prop says — the caller owns time. Remotion passes `useCurrentFrame()`; browsers pass `useWallClockFrame({ fps: 30 })`. One implementation runs in deterministic video renders and on a live page.

**Avoid:** any human face/team/handshake/"person-at-laptop"; stock tech photography (glowing servers, holographic globes, circuit-board macro); 3D glossy coins, floating tokens, glassmorphism; aurora/mesh gradients; isometric flat-people illustration; anything implying a consumer app.

## 07 — Iconography

Monoline, constructed, geometric. Single stroke weight (~1.5px at 24px), straight-line/rational-curve geometry, squared terminals — matching the mark and the Plex grid. Functional and utilitarian, never a mascot.

The v1 instruction set is the icon family (glyph concepts from the original brief, still the reference when icons are built):

| Verb | Glyph concept |
|---|---|
| `create_subaccord` | bounded scope / bracketed region |
| `stake` | a value locked into a slot |
| `create_dispute` | two diverging claims |
| `draw` | a node selected from a set (VRF randomness as offset dots) |
| `commit` | a sealed envelope / closed hash |
| `reveal` | the sealed envelope opening |
| `appeal` | an arrow looping back / escalation rungs |
| `finalize` | a verdict stamp / single convergent node |
| `get_ruling` | an outbound arrow from the converged node |

**Avoid:** emoji (anywhere in product or brand surfaces); rounded "friendly" icon sets; filled/chunky icons; literal-justice iconography; hand-drawn/brush icons; color-filled icon bodies (state color is a status dot, never the icon itself).

## 08 — Layout & surface expressions

Accord is digital-only. Every surface is dark-first, terminal-native.

### Website structural rules (as shipped on `apps/landing`)

1. **Left-biased hero, not centered.** The settled hero left-aligns its headline (`max-w-xl` measure) inside the full container, leaving right whitespace the `Backdrop` fills. The prologue may broadcast centered; the settled state biases left. `min-h-[100svh]`.
2. **Prologue → mechanism.** A one-shot text animation cycles the real capture-failure cases (ORACLE · FOUNDERS · COURTS), each ending "Who's right?", then settles on the mechanism hero ("Mechanize the verdict."). Honors `prefers-reduced-motion` (boot script settles before paint; the beats render as a readable `sr-only motion-reduce:not-sr-only` list) and dies on scroll/Escape. Replay button bottom-center. Named easing throughout: `--ease-expo` (§12) — never bounce, never bare `ease`.
3. **Code as a typographic frame, never a fake window.** The two CPI calls render in Plex Mono on a raised panel (`rounded-lg border bg-raised`) with a hairline rule + Plex Mono filename label (`arbitrable.rs`). No traffic-light dots, no mock title bars — the user's environment is the chrome.
4. **Asymmetric guarantees, not a 3-equal grid.** The structural moats render as a vertical numbered list — narrow mono index column (`01` `02` `03` in amber, `sm:grid-cols-[3.5rem_1fr]`) + wide content, hairline dividers (`divide-y`), never three equal cards.
5. **One centered section, maximum** — the closing CTA (`max-w-3xl text-center`, amber "Who's right?"). Every other section biases left or uses asymmetric columns.
6. **Eyebrow restraint.** Plex Mono ALL-CAPS labels are a sanctioned type role, not a per-section tic — capped at one ordinal section (the Lineage chronology) plus the hero's own framing. Most sections lead with the heading.
7. **Nav = N9 edge-aligned mono status bar.** Wordmark + convergence mark + a mono status chip (`● live on mainnet`, amber dot) left; links in Plex Mono right (`How it Rules / Docs / GitHub / Open App`). Not the wordmark-left / sans-links / CTA-right SaaS nav.
8. **One antagonist stat ribbon.** Slash-tinted callout (`border-slash/30 bg-slash/5`) carrying the specific figures — "March 2025 — one actor with 25% of UMA tokens flipped a $7M Polymarket contract" — never a softened euphemism.
9. **Honest scope.** No dispute counts, TVL, or "trusted by" logos — none exist. State "live on mainnet, unaudited" plainly (footer, honest-scope card).

### Spacing & container

- **Base unit 4px** (Tailwind default scale); utilities only, no bespoke spacing tokens.
- **Section rhythm:** `py-24 sm:py-32` (96/128px) with `border-t border-border/60` hairline between bands; inner list dividers at `border-border/70`.
- **Container:** `mx-auto max-w-5xl px-6` (1024px + 24px gutters) for every band; the closing CTA narrows to `max-w-3xl`. Headline measures cap at `max-w-xl`/`max-w-2xl`/`max-w-3xl` — copy never runs the full container width.
- **Whitespace philosophy:** generous bands separated by hairlines, not fills; the mechanism strip gets a tall field (`mt-12 pt-12`, `gap-9` between acts) the way a worked example gets mostly empty ground.

### Landing section inventory

`Nav` (h-16, §8.1 N9) → `Hero` (prologue + settled hero + `Backdrop` + `Waitlist`) → `Mechanism` (code frame + `MechanismStrip`) → `Capture` (numbered moats + antagonist ribbon + "An accord, not a committee.") → `Heritage` (lineage chronology: `sm:grid-cols-[8rem_1fr]` rows, mono amber year + sans name) → `Audience` (+ honest-scope card `rounded-lg border bg-raised px-6 py-5`) → `FinalCTA` (centered) → `Footer` (`py-12`; brand block `max-w-xs` left with mark + tagline, link column right; bottom rule `mt-10 border-t pt-6` with mono xs meta "© … · live on mainnet · unaudited / useaccord.xyz").

`MechanismStrip` — the mechanism as a living loop, all kit pieces under `role="img"` + aria-label: `JurorPool` (30 dots, 15 cols, "STAKED POOL · 30") → five `SealedVote`s (`rounded-md bg-raised px-5 py-2.5 font-mono text-lg`, confirm/slash tones, the incoherent NO crossed) → `TallyBar` (520px) → `RulingStamp` "RULING: YES". 360-frame loop @ 30fps (12s); reduced-motion visitors get the settled frame.

`Waitlist` — kit `Input` (mono, `px-4 py-3`, flex-1) + kit `Button` (`px-5 py-3`), stacked below `sm`, inline above; status line `text-xs` in confirm/slash/muted.

### App surfaces & the kit

Product apps (`apps/app`, `apps/canon`, `apps/synod`) compose the kit (`@useaccord/ui`):

- **Patterns** (slot-based, boundary-clean): `ProductNavbar` — sticky `top-0 z-50` translucent bar (`bg-card/80 backdrop-blur-xl`, `supports-[backdrop-filter]:bg-card/70`, solid + blur-free under `prefers-reduced-transparency: reduce`) with `brand` / `navigation` / `accountControls` / `mobileNavigation` slots (wallet/cluster controls stay app-side). `PageShell`, `PageTransition` (keyed route fade, §12), `DisputeStatusCard` (display-only rows), `EmptyState` / `ErrorState`, `DepthPicker`, `DomainDocCard`.
- **Primitives** (shadcn, kit-owned): `Button`, `Badge`, `Card` family, `Input`, `Textarea`, `Select`, `Dialog`, `Table`, `Toaster`, `Spinner`, `Skeleton`, `Separator`, `Label`, `Field` family, `Copyable`, `MarkdownText`, `Alert`.
- **`Button`** — variants: `default` (amber on ink, `hover:bg-primary/80`), `outline`, `secondary`, `ghost`, `destructive` (`bg-destructive/10 text-destructive`), `link` (amber underline-offset). Sizes: `default` h-8, `xs` h-6, `sm` h-7, `lg` h-9, `icon` size-8. `loading` shows the kit `Spinner`, sets `aria-busy`, disables. Press: `active:scale-[0.96]` (excluded on `aria-haspopup` triggers). Focus: `ring-3 ring-ring/50`.
- **`Card`** — `rounded-xl bg-card ring-1 ring-foreground/10` (ring, not border), `--card-spacing` padding (spacing-4; `size="sm"` → spacing-3), `overflow-hidden`, first-child images bleed to the rounded corners.

**Kit boundary (enforced):** the kit must not import `@solana/*`, `@useaccord/sdk|canon|synod`, `react-router-dom`, `@tanstack/react-query`, or `import.meta.env`. Apps own routes, links, wallets, data fetching, env vars, product copy, and logos — `AccordMark` is the one recorded exception (shared house identity). `packages/ui` is the canonical shadcn owner (`components.json` lives there): add primitives via `cd packages/ui && pnpm dlx shadcn@latest add <primitive>`, fix imports package-relative, export from `src/index.ts`, add story + tests, migrate consumers — apps never regenerate primitives locally.

### Responsive behavior

Tailwind default breakpoints; `sm` (640px) is the structural switch, `md` (768px) bumps the hero to 72px.

| Width | Key changes |
|---|---|
| < 640px | Numbered/lineage rows collapse to single column; waitlist stacks; nav status chip hides; hero h1 48px. |
| ≥ 640px | Two-column rows (`3.5rem`/`8rem` index + content), inline waitlist, status chip visible, hero h1 60px, body steps 14→16px. |
| ≥ 768px | Hero h1 72px. |
| All | Container stays `max-w-5xl`; section rhythm `py-24 sm:py-32`; hero `min-h-[100svh]`. |

**Touch targets:** 40px minimum for interactive elements — extend smaller ones with `after:absolute after:-inset-3.5 after:content-['']`. **Images:** `outline outline-1 -outline-offset-1 outline-white/10` in dark mode — pure white at 10%, never tinted neutrals.

## 09 — Voice-to-visual bridge

The visual system reads as one mechanism with the copy:

- **Sentence case + period, always** on headlines and the tagline. Level 1 headline: "Justice is infrastructure." Locked tagline: "Mechanize the verdict."
- **Mechanism first, vision as punchline** — code/diagram above the fold; belief-statement copy as support, not hero.
- **Name the antagonist concretely** — slash-red callouts carry the specific figure (UMA, $7M, 25%, March 2025), never a softened "governance concerns."
- **No vendor vocabulary, no vendor visuals** — "seamless"/"empower"/"solution" banned in copy; gradients-as-default, glassmorphism, trust-shield/handshake iconography banned in visuals. Same discipline, two channels.
- **Peer-to-peer, not vendor-to-customer** — no "diverse team" stock, no smiling-user screenshots; the Integrator is a fellow builder.

## 10 — What to never ship

**Always:** tokens over hex (`text-amber`, `bg-raised` — never raw values); kit primitives over hand-rolled UI; sentence case + period; mono for anything identified, numeric, or labeled; mechanism diagrams as the imagery; amber for exactly its reserved roles; 40px hit areas; enumerated transition properties.

If any of these appear in a design file, it is a brand violation, not a style note:

- Scales, gavels, courthouses, columns, handshakes, padlocks, trust shields, rockets, moons.
- Glossy 3D coins, gradients-as-default, glassmorphism.
- Hype-purple / neon-rainbow / aurora gradients.
- Any human face, team photo, or "diverse office" stock.
- Hand-drawn, brush, or "friendly" rounded mascots/icons.
- Emoji anywhere in product or brand surfaces.
- Filled or chunky icon styles.
- All-caps body copy or sans headlines.
- Fabricated metrics (dispute counts, TVL, "trusted by" logos) — none exist; sample data must carry a `[SAMPLE DATA]` label.
- Faked UI chrome — fake browser, phone, code-window, or IDE frames (mock title bars, traffic-light dots, fake file tabs). The user's real environment is the only chrome.
- Three-equal-column feature/proof grids — the universal AI landing template. Vary column widths, drop a column, or use a vertical/asymmetric rhythm.
- Centered-everything pages — center at most one section (the closing CTA).
- Eyebrow-on-every-section — cap at one ordinal section plus the hero's framing line.

## 11 — Open decisions & known gaps

1. **Wordmark** is typeset (`font-heading` Plex Sans bold), not a custom-drawn cap-skeleton logotype — the custom-drawn variant remains open for ownability.
2. **Icon family** — the nine v1-verb glyphs (§07) are concepts, not built assets; no icon set ships yet.
3. **Amber→ink gradient** as a rare hero accent — still undecided; treat as banned until decided.
4. **Light surface** — `--accord-paper` is tokenized but unused; no light theme exists and none is planned (`theme.css`: dark is the only theme).
5. **Exact neutral ramp** — values as implemented are GitHub-dark-derived and shipped; treat as settled unless a legibility audit says otherwise.

## 12 — Motion & interaction system

Established across `apps/app`, `apps/landing`, and applicable to every Accord web surface. Implemented in `packages/ui/src/motion/` (`StaggerGroup`, `StaggerItem`, `Reveal`, `ErrorShake`, `EASE_EXPO`).

### Motion personality

**Corporate** — crisp, professional, zero overshoot on enters. No bounce on fades, menus, or modals. Springs for everything motion-powered; CSS transitions for hover/state changes. No bounce interactions exist in v1.

### Easing & springs

- **`--ease-expo: cubic-bezier(0.22, 1, 0.36, 1)`** — the brand curve (fast start, gentle landing) for all CSS transitions; exported as `EASE_EXPO`. Never bare `ease`, `ease-in` on entrances, or `linear` on spatial movement.
- Springs (motion/framer-motion): enter `{ type: "spring", bounce: 0, duration: 0.4 }`; exit `0.3` (snappier); stagger `staggerChildren: 0.06` (60ms).
- Durations: micro 80ms (tooltip, shake segment) · quick 150ms (dialog close, press feedback) · fast 200–250ms (select open, icon swap) · medium 300ms (dialog open, overlay fade) · slow 400ms (page transition, skeleton reveal). Distance scales duration; enter runs 30–50% longer than exit.

### Patterns

- **Page transitions:** `AnimatePresence mode="wait"` + `motion.div` keyed on `location.pathname`; opacity 0→1, y 12→0, blur 4px→0, spring 0.4s in / 0.3s out. Kit: `PageTransition`.
- **Card grid stagger:** `StaggerGroup`/`StaggerItem`; 60ms stagger, opacity + y12 + blur4, spring 0.4s.
- **Card hover (three layers):** `hover:-translate-y-0.5` (2px lift) + `hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)]` + `hover:ring-amber/40`, with `transition-[transform,box-shadow]`.
- **Skeleton reveal:** `Reveal` keyed on state (`"skeleton"/"error"/"content"/"empty"`); cross-blur opacity + blur 2px, 400ms; skeleton appears instantly.
- **Dialog:** `duration-300` + `zoom-in-96`/`zoom-out-96`; overlay `duration-300` + `backdrop-blur-xs`. Never `duration-100`, never `zoom-in-95`.
- **Select:** `duration-200` + `zoom-in-96`, scaling from the trigger origin.
- **Icon swap:** two icons in DOM, cross-fade `duration-250`, scale 0.25→1, blur 4→0, `cubic-bezier(0.2, 0, 0, 1)`. Never `scale(0)`.
- **Button press:** `active:scale-[0.96]` via CSS; `transition-[background-color,border-color,color,box-shadow,scale]` — enumerated, never `transition: all`.
- **Error shake:** `ErrorShake` fires once on null→string; keyframes `[0, -8, 8, -6, 6, 0]`, 400ms easeInOut; wraps the whole form.
- **Hero prologue:** beats held 3000ms, 540ms expo crossfades, 500ms tail before settling; CSS stages at 500/520/600ms `--ease-expo`, beats rise `translateY(8px) → none`. No-flash boot script (`html.js` / `.is-settled`) in `index.html`; dies on scroll or Escape; replay button.
- **Ambient canvas:** `Backdrop` and the mechanism strip are wall-clock driven at 30fps (`useWallClockFrame`), looping (strip: 360 frames = 12s) — pure functions of `frame`, so reduced-motion simply pins the settled frame.

### Accessibility

- `MotionConfig reducedMotion="user"` wraps every app — motion-library animation collapses to opacity-only for reduced-motion users.
- Global CSS `@media (prefers-reduced-motion: reduce)` clamps animation/transition durations (landing kills owned motion entirely; the kit collapses to instant state swaps).
- `@media (prefers-reduced-transparency: reduce)` — translucent surfaces become solid.

### Styling discipline

1. **No plain CSS classes** — Tailwind utilities referencing the token system (`bg-card`, `text-muted-foreground`, `border-border`), never bespoke `.page`/`.card` classes.
2. **Transition specificity** — never `transition: all`; enumerate properties.
3. **Ring over border for depth** (§04); borders for layout separators.
4. **Hit area minimum** 40px (§08).
5. **Image outlines** white/10 in dark mode.

### CTA voice (inline Tailwind, when not using kit `<Button>`)

- **Primary:** `inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]`
- **Ghost:** `inline-flex items-center justify-center rounded-md bg-transparent px-3.5 py-2 text-sm font-semibold text-primary ring-1 ring-inset ring-primary transition-[background-color,scale] hover:bg-primary/10 active:scale-[0.96]`

### Applying to a new surface

1. `@import "tailwindcss"; @import "tw-animate-css"; @import "@useaccord/ui/styles.css"; @source "../../../packages/ui/src";` in the app's CSS (Tailwind engine ownership stays app-side).
2. Wrap providers in `<MotionConfig reducedMotion="user">`.
3. Compose `ProductNavbar`/`PageShell`/`PageTransition`; keep wallet/cluster controls in app slots.
4. Use kit primitives and `EASE_EXPO`; add `active:scale-[0.96]` + enumerated transitions to any custom CTA.
5. Navbar translucent + sticky; dialogs `duration-300` + `zoom-in-96`; selects `duration-200`; card hover three-layer.
6. Wrap list conditionals in `<Reveal>`, form errors in `<ErrorShake>`, grids in `StaggerGroup`.
