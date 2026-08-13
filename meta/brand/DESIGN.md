# Accord — DESIGN.md

> **Status:** Direction brief, not a spec of existing assets. No logo, no
> production assets exist yet — Accord is pre-launch. This file is the
> single working reference for anyone designing an Accord surface. It
> synthesizes `brand/visual-identity.md`, `brand/audience.md`, and
> `brand/messaging.md` into one document a designer, or an engineer
> shipping UI, can build from without cross-referencing three sources.
>
> **Provenance.** Grounded in the locked Brand Model (`BRAND.md`,
> 2026-08-04), `brand/context.md`, `brand/voice.md`, the Visual Identity
> Brief, the Audience Framework, and the Messaging Framework. Where a
> decision is genuinely subjective and not derivable from locked source,
> it is flagged `[DRAFT — designer to confirm]`. Nothing in this file
> overrides those source documents; this is a compressed, design-facing
> read of them.

---

## 00 — ONE-PARAGRAPH BRIEF

Accord is **The Mechanist**. It builds a Solana primitive —
`create_dispute()` → `get_ruling()` — that resolves subjective disputes
through a Schelling-point court instead of a trusted committee. The
audience is **The Integrator**, a protocol engineer who lives in an IDE,
evaluates tools by reading source, and is allergic to governance theater
and crypto hype. Every design decision serves one test: **does this make
the mechanism legible, or does it decorate over it?** Ornament loses.
The aesthetic is terminal-native — dark surfaces, monospace as structure,
one signal-bright accent — because the product surface *is* code, and
that's who's in the room.

---

## 01 — WHO WE'RE DESIGNING FOR

**Primary — The Integrator** (Solana protocol engineer, 25–40, ships
Anchor programs, reads source before landing pages). Adopts a primitive
by committing a CPI call, not by signing up. Lives in dark IDE themes,
GitHub, X/Twitter builder accounts, mtnDAO/MetaDAO Discords. Evaluates
by reading the README, the program, the IDL, the tests.

**Secondary — The Juror** (crypto-native participant who wants to earn by
being right, not by governing). Cares about legible economics: draw odds,
slash factor, expected yield. Design implication: staking/draw/slash
dashboards must make the mechanism's economics readable at a glance.

**Tertiary — The Subaccord Creator** (a builder-turned-founder
parameterizing Accord for their own domain). Design implication: the
`create_subaccord()` parameter surface must be self-documenting.

**Explicitly not the audience:** the End User (experiences a verdict
*through* an application, never sees Accord directly), consumer-crypto
degens, non-Solana/EVM developers (v1 scope), anyone wanting a hosted
arbitration service, anyone whose design requires a human referee.

**Design takeaway:** design for a dark IDE open in a second monitor, not
for a landing page competing for attention. **The GitHub README is the
primary brand surface** — treat it with as much design intent as the
website.

---

## 02 — IDENTITY STRATEGY

Accord's visual system must look like the work of a mechanist: precise,
constructed, load-bearing, stripped of theater. Every visual element
either *is* the mechanism or gets out of its way.

**The only sanctioned source of form** is the **Schelling Point** —
independent agents converging without communication. Convergence motifs
(nodes, aligning vectors, strokes meeting at one point) may appear,
sparingly, as the brand's structural metaphor — never as flourish.

### Four design principles

1. **Mechanism over decoration.** If a line, gradient, or flourish
   carries no information about how Accord works, delete it.
2. **Code is the surface.** Monospace is structural, not decorative —
   identifiers, the two CPI calls, stats, labels, and version tags carry
   typographic primacy.
3. **Dark-first, signal-bright.** Design for the developer's actual
   environment; reserve the amber/green/red palette exclusively for
   states that matter.
4. **Convergence as the only sanctioned metaphor.** Used sparingly, as
   structure (dividers, the logo symbol, diagram spines) — never as
   filler.

---

## 03 — LOGO

**Direction:** constructed wordmark + optional geometric convergence
symbol. Wordmark carries the brand alone (favicons, README headers,
social avatars); symbol is used where a square/circular glyph is needed.

- **Construction:** start from a geometric grotesque or monospace cap
  skeleton, tighten tracking, square the terminals. Not hand-drawn, not
  illustrative.
  `[DRAFT — designer to confirm]`: Plex Sans-set vs. custom-drawn variant
  of the Plex Sans cap skeleton (recommended: custom-drawn, for
  ownability without abandoning the type system).
- **Character:** engineered certainty — a stamp a mechanism leaves on a
  verdict. Closer to a calibration mark or serial-number stamp than a
  consumer app icon.
- **Style:** constructed not organic (straight strokes, rational
  geometry, consistent stroke weight); monoline (single weight, no
  tapering).
- **Symbol concept:** derive from the Schelling Point — 2–3 convergent
  strokes meeting at one node, or a node with radiating aligning
  vectors. Must read as *convergence to a point* at 16×16px.
  `[DRAFT — designer to confirm]` exact construction.
- **Dark-first:** design on `#0A0E14` before any light variant. Must
  hold at favicon size and in monochrome (amber → white on dark, ink →
  black on light).

**Hard bans (brand violations, not preferences):** scales of justice,
gavels, courthouses, columns; handshakes, linked rings, trust shields,
padlocks; rockets, moons, generic crypto glyphs; glossy 3D coins,
default gradients, glassmorphism; hype-purple / neon-rainbow / aurora
gradients; human figures, faces, "diverse team" stock; hand-drawn,
brush, or "friendly" rounded mascots.

**Reference qualities to borrow (not imitate):**

| Reference | Borrow | Do not borrow |
|---|---|---|
| Linear | constructed precision, dark-first application | its near-monochrome violet identity color |
| Foundry / Anvil (Paradigm) | mechanism-as-symbol — the mark distills what the product *does* | — |
| Stripe | wordmark discipline as a credibility signal, no mascot needed | its gradient secondary expression |

Jito and Solana's own infra-adjacent language are honorable mentions for
*register* — context, not logo references.

---

## 04 — COLOR

**Palette type:** dominant-and-accent with restricted semantic state
colors. Structurally monochromatic (ink-dominant), one identity accent
(amber), two functional state colors (green/red). Not a triadic "crypto
rainbow." No gradients as default.

### Core tokens

| Token | Hex | Role |
|---|---|---|
| **Verdict Amber** | `#F0A830` | Identity accent. Logo lockup, primary CTA, active/selected states, `get_ruling()` highlight in code samples, eyebrows, links. Reserved — never a generic warning fill. |
| **Ink (base)** | `#0A0E14` | Primary surface. Cold near-black, faint blue undertone — not pure black. |
| **Raised** | `#11161D` | Cards, code blocks, raised panels. (Amber sits here for contrast, not on base ink.) |
| **Border** | `#1F2630` | Hairlines, dividers, table rules. |
| **Muted** | `#7D8590` | Secondary text, captions, eyebrows on dark. |
| **Body (dark)** | `#C9D1D9` | Body text on dark surfaces. |
| **Near-white** | `#F0F6FC` | Headlines on dark; all type on light surfaces. |
| **Paper (light bg)** | `#F6F7F8` | Rare light surface (docs print view). |
| **Confirm Green** | `#3FB950` | State: ruling finalized, commit confirmed, successful CPI. GitHub-merged-PR green. Status dots/badges only — never a brand fill, never a CTA. |
| **Slash Red** | `#F85149` | State: slash, incoherence, the antagonist failure mode. Error states, slash-factor callouts. Restricted — overuse dilutes the meaning. |

Neutral ramp is intentionally GitHub-dark-derived — the most legible
type/background system for a developer audience.
`[DRAFT — designer to confirm]` exact ramp values; the *register*
(GitHub-dark) is locked.

### Usage rules

- Dark-first everywhere; light surfaces are the rare exception and must
  re-derive from the same hexes — no separate "light palette."
- Amber + ink is the signature pairing.
- Never combine Confirm Green and Slash Red adjacent except inside an
  explicit mechanism diagram (honest vs. incoherent vote).
- No gradients as default surface treatment. A single amber→ink
  gradient is `[DRAFT — designer to confirm]`, permitted only as a rare
  hero accent — never a button, card, or background default.
- Never place amber text on Confirm Green or Slash Red.

---

## 05 — TYPOGRAPHY

Two-family engine, same foundry, same engineered register:

- **IBM Plex Sans** — primary. Headlines, subheads, body, navigation.
  Engineered-humanist grotesque; open source; more ownable than the
  Inter/Geist default every infra brand reaches for.
- **IBM Plex Mono** — secondary, **structural, not decorative.** All
  code/on-chain identifiers (`create_dispute()`, `get_ruling()`, `stake`,
  `draw`, `commit`, `reveal`, `appeal`, `finalize`, `slash factor`),
  eyebrows/labels, numeric data and stats, version tags. Optionally the
  wordmark itself `[DRAFT — designer to confirm]`.

### Hierarchy

| Level | Face | Treatment |
|---|---|---|
| Display / hero headline | Plex Sans | SemiBold (600), tight tracking (-0.02em), sentence case |
| Section headline | Plex Sans | Medium (500), sentence case |
| Subhead | Plex Sans | Medium (500) |
| Body | Plex Sans | Regular (400), 1.5–1.6 line-height |
| Eyebrow / label | Plex Mono | Medium (500), ALL CAPS, +0.08em tracking, amber or muted |
| Code / identifier | Plex Mono | Regular (400), on raised `#11161D` panel |
| Numeric / stat | Plex Mono | Medium (500), tabular figures |
| Tagline ("Mechanize the verdict.") | Plex Sans | Medium (500), sentence case, **period included** |

**Locked, non-negotiable:** sentence case + period convention (from
`voice.md`/`BRAND.md`). `[DRAFT — designer to confirm]` exact
weights/tracking beyond that.

**Avoid:** Inter/Geist/SF Pro/Helvetica as primary (generic); display
serifs (wrong register — editorial, not infra); rounded "friendly"
grotesques (Nunito, Quicksand, Poppins); script/brush/hand-drawn faces;
mono as a running body face; variable-axis stretch gimmicks; all-caps
body or headlines (caps are reserved for mono eyebrows/labels).

---

## 06 — IMAGERY

**No photography of people, ever** — the single most important rule.
The audience has no human face in the brand; the mood is schematic and
technical, closer to a cryptography whitepaper than marketing photography.

**The only sanctioned imagery:**

- Mechanism diagrams — the dispute lifecycle drawn as a schematic
  (`create_subaccord → stake → create_dispute → draw → commit → reveal →
  appeal → finalize → get_ruling`), monoline ink + amber, Plex Mono
  labels. These diagrams *are* the brand imagery.
- Schelling-point / convergence visualizations — distributed juror nodes
  converging on a single ruling.
- Terminal / code-surface treatments — real code, terminal output, log
  lines, used as hero imagery.
- Stat callouts as imagery — "1,000+ disputes," "$7M / 25% / March
  2025" — set in Plex Mono on dark, treated as visual objects.
- Abstract technical texture, sparingly — grids, isometric schematics,
  hairline wireframes.

**Avoid:** any human face/team/handshake/"person-at-laptop"; stock tech
photography (glowing servers, holographic globes, circuit-board macro);
3D glossy coins, floating tokens, glassmorphism; aurora/mesh gradients;
isometric flat-people illustration; anything implying a consumer app
(phone-in-hand, smiling-user screenshots).

---

## 07 — ICONOGRAPHY

**Style:** monoline, constructed, geometric. Single stroke weight
(~1.5px at 24px), straight-line/rational-curve geometry, squared
terminals — matching the wordmark and Plex grid. Functional and
utilitarian, never a mascot.

**v1 instruction set as an icon family (recommended):**

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

`[DRAFT — designer to confirm]` glyph concepts; the constraint is
monoline + constructed + mechanism-derived, not literal objects.

**Avoid:** emoji; rounded "friendly" icon sets (Font Awesome solid,
generic app packs); filled/chunky icons; literal-justice iconography;
hand-drawn/brush icons; color-filled icon bodies (state color is a
status dot only, never the icon itself).

---

## 08 — BRAND EXPRESSIONS BY SURFACE

Accord is **digital-only** — no print, packaging, or signage.

- **Website** — dark-first, terminal-native. Structural rules (Hallmark-audited,
  `brand/DESIGN.md`-managed — no catalog theme drift):
  - **Left-biased hero, not centered.** The settled hero left-aligns its
    headline within a wide measure, leaving deliberate right whitespace the
    faint wireframe grid fills. A centered full-viewport hero is the default AI
    template — refuse it. (The prologue animation may broadcast centered; the
    settled state biases left.)
  - **Prologue → mechanism.** A one-shot text animation cycles 2–4 real
    capture-failure cases, each ending "Who's right?", then settles on the
    mechanism hero ("Mechanize the verdict."). Honors `prefers-reduced-motion`
    (static hero + readable cases) and dies on scroll. Named exponential easing
    (`--ease-expo`); never bounce, never bare `ease`.
  - **Code as a typographic frame, never a fake window.** The two CPI calls
    render in Plex Mono on a raised ink panel with a hairline rule + a Plex Mono
    filename label (`arbitrable.rs`). No faked editor/terminal chrome — no
    traffic-light dots, no mock title bars. The user's environment is the chrome.
  - **Asymmetric guarantees, not a 3-equal grid.** The structural moats render
    as a vertical numbered list (narrow index column + wide content, hairline
    dividers), never three equal cards.
  - **One centered section, maximum** (the closing CTA). Every other section
    biases left or uses asymmetric columns.
  - **Eyebrow restraint.** Plex Mono ALL-CAPS labels are a sanctioned type role,
    not a per-section tic — cap at one ordinal section (the Lineage chronology)
    plus the hero's own framing line. Most sections lead with the heading.
  - **Nav = N9 edge-aligned mono status bar.** Wordmark + convergence glyph +
    a mono status chip (`● v1 · build target`) left; links in Plex Mono right.
    Not the wordmark-left / sans-links / CTA-right SaaS nav.
  - Headline Plex Sans SemiBold, sentence case, period. Primary CTA in Verdict
    Amber on raised ink. One antagonist stat ribbon (UMA, $7M, 25%, March 2025).
    No hero photo, no gradient backdrop.
- **GitHub README (the primary brand surface)** — mono-forward: the v1
  instruction set as a *designed* Plex Mono block with amber section
  markers, not a plain code fence. Convergence symbol as README hero.
  ASCII/mono-styled badges, not glossy. Social card = dark lockup + the
  two CPI calls, full stop.
- **Social (X / Farcaster)** — dark cards, mono stat callouts, one
  mechanism per post. Recurring visual: `create_dispute() → get_ruling()`.
  No hype threads, no rocket/candle emoji, no engagement-bait gradients.
- **Pitch deck** — dark slides, one mechanism per slide, amber as the
  single accent. Schematic diagrams replace bullet lists wherever
  possible. Tagline close in Plex Sans Medium, amber.
- **Developer docs** — dark theme default, paper `#F6F7F8` light view
  for print/export. Every term (Subaccord, draw, slash factor,
  sortition) defined once, inline, in Plex Mono. Code blocks are
  first-class. Error/empty-state copy is imperative, no hedging
  ("Dispute not finalizable. Wait for the reveal window to close.").

---

## 09 — VOICE-TO-VISUAL BRIDGE

The visual system must read as one mechanism with the copy. Key rules
from `voice.md`/messaging that have direct visual consequences:

- **Sentence case + period, always** on headlines and the tagline — no
  all-caps headlines. (All-caps is reserved for mono eyebrows/labels.)
- **Mechanism first, vision as punchline** — visually, this means code /
  diagram above the fold, belief-statement copy ("Justice is
  infrastructure.") as support, not the hero image itself.
  Level 1 headline: **"Justice is infrastructure."** Locked tagline:
  **"Mechanize the verdict."**
- **Name the antagonist concretely** — when a slash-red callout appears,
  it should carry the specific figure (UMA, $7M, 25%, March 2025), never
  a softened "governance concerns" euphemism.
- **No vendor vocabulary, no vendor visuals** — words like "seamless,"
  "empower," "solution" are banned in copy; the visual equivalent is
  banning gradients-as-default, glassmorphism, and trust-shield/handshake
  iconography. Same discipline, two channels.
- **Peer-to-peer, not vendor-to-customer** — no "diverse team" stock, no
  smiling-user screenshots, because the Integrator is a fellow builder,
  not a customer being sold to.

---

## 10 — WHAT TO NEVER SHIP (cross-reference)

A consolidated list — if any of these appear in a design file, it is a
brand violation, not a style note:

- Scales, gavels, courthouses, columns, handshakes, padlocks, trust
  shields, rockets, moons.
- Glossy 3D coins, gradients-as-default, glassmorphism.
- Hype-purple / neon-rainbow / aurora gradients.
- Any human face, team photo, or "diverse office" stock.
- Hand-drawn, brush, or "friendly" rounded mascots/icons.
- Emoji anywhere in product or brand surfaces.
- Filled or chunky icon styles.
- All-caps body copy or headlines.
- Fabricated metrics (Accord dispute counts, TVL, "trusted by" logos) —
  the program is a stub crate; v1 is a build target, not a shipped
  product. Design must not imply otherwise (e.g., no fake dashboard
  numbers in mockups without a `[SAMPLE DATA]` label).
- Faked UI chrome — fake browser, phone, code-window, or IDE frames (mock title
  bars, traffic-light dots, fake file tabs). The user's real environment is the
  only chrome; show content, don't redraw the OS.
- Three-equal-column feature/proof grids — the universal AI landing template.
  Vary column widths, drop a column, or use a vertical/asymmetric rhythm.
- Centered-everything pages — centered hero + centered sections + centered CTA.
  Bias at least one section asymmetrically; center at most one (the closing CTA).
- Eyebrow-on-every-section — an uppercase mono kicker above every heading. A
  sanctioned type role, not a tic: cap at one ordinal section (e.g. Lineage)
  plus the hero's own framing line.

---

## 11 — OPEN DESIGN DECISIONS

Items flagged `[DRAFT — designer to confirm]` throughout, gathered here
for tracking:

1. Wordmark: Plex Sans-set vs. custom-drawn cap-skeleton variant.
2. Exact convergence-symbol construction (must read at 16×16px).
3. Exact neutral-ramp hex values (register — GitHub-dark — is locked).
4. Exact type weights/tracking beyond the locked sentence-case+period
   rule.
5. Whether the wordmark itself is set in mono (signals "protocol, not
   product") vs. Plex Sans.
6. Amber→ink gradient as a rare hero accent — permitted or not.
7. Exact glyph concepts for the nine v1-verb icon family.

- **Hallmark allegiance (resolved 2026-08-05).** Every Accord web surface stamps
  its macrostructure and design-system allegiance as the first CSS line:
  `/* Hallmark · macrostructure: <name> · design-system: brand/DESIGN.md · ... */`.
  The landing page ships `Manifesto (technical)`. Subsequent surfaces pick a
  different macrostructure per Hallmark's diversification rule, all within the
  locked ink + amber + Plex system. See the expanded Website rules in §08 and
  the new structural bans in §10.

---

## 12 — MOTION & INTERACTION SYSTEM

Established across the app (`apps/app`), landing (`apps/landing`), and
applicable to every Accord web surface including `apps/canon`. This section
captures the motion vocabulary, component interaction patterns, and styling
discipline so any surface can be brought into compliance without
re-discovering the decisions.

### Motion personality

**Corporate** — crisp, professional, dashboard. Zero overshoot on enters.
No bounce on fades, menus, or modals. Springs for everything motion-powered
(page transitions, staggered grids); CSS transitions for hover/state changes
(button press, icon swap, ring color). Reserve bounce (`0.1–0.2`) only for
momentum-driven interactions (flick, drag release) — none exist in v1.

### Spring configs (motion / framer-motion)

| Interaction | Config |
|---|---|
| Default UI spring (enter) | `{ type: "spring", bounce: 0, duration: 0.4 }` |
| Exit spring | `{ type: "spring", bounce: 0, duration: 0.3 }` (snappier) |
| Stagger between items | `staggerChildren: 0.06` (60ms) |

### CSS easing token

```css
--ease-expo: cubic-bezier(0.22, 1, 0.36, 1);
```

The brand's signature curve. Use for all CSS transitions — hover, state
changes, icon swaps. "Smooth ease-out": fast start, gentle landing. Never
bare `ease`, `ease-in` on entrances, or `linear` on spatial movement.

### Duration vocabulary

| Name | Duration | Usage |
|---|---|---|
| Micro | 80ms | Tooltip delay, shake segment |
| Quick | 150ms | Dialog/modal close, button press feedback |
| Fast | 200–250ms | Select/dropdown open, icon swap |
| Medium | 300ms | Dialog/modal open, overlay fade |
| Slow | 400ms | Page transition, skeleton reveal, panel open |

Distance scales duration: 100px = base. Enter is 30–50% longer than exit.

### Transition patterns

#### Page transitions

`AnimatePresence mode="wait"` + `motion.div` keyed on `location.pathname`.
Enter: opacity 0→1, y 12→0, filter blur(4px)→blur(0px), spring 0.4s.
Exit: same in reverse at spring 0.3s.

#### Card grid stagger

`StaggerGroup` (motion.ul) + `StaggerItem` (motion.li). Stagger delay 60ms.
Each item: opacity 0→1, y 12→0, filter blur(4px)→blur(0px), spring 0.4s.

#### Card hover (three motion layers)

Primary: `hover:-translate-y-0.5` (2px lift).
Secondary: `hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)]` (depth shadow).
Ambient: `hover:ring-amber/40` (amber glow ring).
Transition: `transition-[transform,box-shadow]` — never `transition: all`.

#### Skeleton reveal (loading → content)

`AnimatePresence mode="wait"` keyed on a state string
(`"skeleton"` / `"error"` / `"content"` / `"empty"`).
Cross-blur: opacity 0↔1, filter blur(2px)↔blur(0px), 400ms easeInOut.
Skeleton state skips enter animation (instant appear — the pulse is already
running).

#### Dialog / modal

`duration-300` + `zoom-in-96` / `zoom-out-96`.
Overlay: `duration-300` + `supports-backdrop-filter:backdrop-blur-xs`.
Never `duration-100` — too fast to register as a deliberate focus shift.
Never `zoom-in-95` — slightly too dramatic.

#### Select dropdown

`duration-200` + `zoom-in-96` / `zoom-out-96`.
`origin-(--radix-select-content-transform-origin)` — scales from trigger,
not center.

#### Icon swap (contextual state change)

Two icons in DOM simultaneously (one absolute overlay). Cross-fade with
`transition-[opacity,filter,scale] duration-250`. Scale 0.25→1, opacity
0→1, blur 4px→0px. Easing: `cubic-bezier(0.2, 0, 0, 1)`.
Never `scale(0)` — nothing appears from nothing.

#### Button press

`active:scale-[0.96]` via CSS (press is not gesture-driven — no motion
library needed). `transition-[background-color,border-color,color,box-shadow,scale]`
— enumerate exact properties, never `transition: all`.
Exclude buttons with `aria-haspopup` from the scale (dropdown triggers).

#### Error shake

`useAnimationControls` + `useEffect` — fires once when error goes
null→string. Keyframes `[0, -8, 8, -6, 6, 0]`, 400ms easeInOut.
±8px, 3 damped oscillations. Wrap the entire form, not just the error text.

### Chrome: translucent materials

Navbars: `sticky top-0 z-50` + `bg-card/80 backdrop-blur-xl`.
Content scrolls under the blurred material layer.
`supports-[backdrop-filter]:bg-card/70` — lighter when blur is supported.
`[@media(prefers-reduced-transparency:reduce)]:bg-card [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none`
— solid fallback for users who prefer reduced transparency.

### Accessibility

- `MotionConfig reducedMotion="user"` wraps the app — all spring/transition
  animations collapse to opacity-only cross-fades for reduced-motion users.
- `@media (prefers-reduced-motion: reduce)` in global CSS — kills position
  changes, keeps opacity/color transitions that aid comprehension.
- `@media (prefers-reduced-transparency: reduce)` — translucent surfaces
  become solid.

### Styling discipline

1. **No plain CSS classes.** All styling through Tailwind utility classes
   referencing shadcn/ui tokens (`bg-card`, `ring-foreground/10`,
   `text-muted-foreground`, `border-border`, `bg-primary`,
   `text-primary-foreground`). The `.page` / `.card` / `.form` / `.input`
   plain-CSS-class pattern is banned — use inline Tailwind classes.
2. **Transition specificity.** Never `transition: all` or Tailwind's bare
   `transition`. Always enumerate: `transition-[transform,box-shadow]`,
   `transition-[opacity,scale]`, `transition-[background-color]`.
3. **Ring over border for depth.** Cards/containers use
   `ring-1 ring-foreground/10` instead of `border border-border` for depth.
   Ring adapts to any background via transparency; solid borders don't.
   (Dividers between list items and form input outlines stay as borders —
   they're layout separators, not depth cues.)
4. **Hit area minimum.** 40px for desktop interactive elements. Extend
   with `after:absolute after:-inset-3.5 after:content-['']`
   pseudo-element if the visible element is smaller.
5. **Image outlines.** `outline outline-1 -outline-offset-1 outline-white/10`
   on images in dark mode — pure white at 10% opacity, never tinted
   neutrals (slate/zinc/neutral read as dirt on the edge).

### CTA voice (inline Tailwind)

When not using the shadcn `<Button>` component (e.g., on `<Link>` or
`<button>` elements in feature pages), apply these exact class strings:

- **Primary CTA:**
  `inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]`
- **Ghost CTA:**
  `inline-flex items-center justify-center rounded-md bg-transparent px-3.5 py-2 text-sm font-semibold text-primary ring-1 ring-inset ring-primary transition-[background-color,scale] hover:bg-primary/10 active:scale-[0.96]`

### Applying to a new surface (e.g., `apps/canon`)

1. Install `motion` (`pnpm add motion`) and wrap providers in
   `<MotionConfig reducedMotion="user">`.
2. Copy `components/motion.tsx` (StaggerGroup, StaggerItem, Reveal,
   ErrorShake, EASE_EXPO) — it's framework-agnostic within React.
3. Ensure shadcn tokens are configured (the `:root` block in `index.css`
   with the ink+amber palette mapped to shadcn variable names).
4. Replace any plain CSS classes with inline Tailwind utilities.
5. Add `active:scale-[0.96]` + specific transition properties to all
   buttons and CTAs.
6. Make the navbar translucent + sticky.
7. Wire `AnimatePresence` route transitions in the app shell.
8. Set dialog `duration-300` + `zoom-in-96`, select `duration-200`.
9. Add card hover lift + shadow to all card components.
10. Wrap list conditionals in `<Reveal>` and form errors in `<ErrorShake>`.

Next step per the source brief: logo exploration (wordmark + convergence
symbol) against this palette and type system, then the v1 instruction
icon family, then the README + website lockup.
