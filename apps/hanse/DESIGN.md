> **Provenance:** this is the Riprap mutuals brand doc (drafted against the `apps/hanse` surface — "the protocol for mutuals"), moved here unchanged from the repo root when the root `DESIGN.md` became the Accord system spec. It is NOT the Accord design system — that lives in `/DESIGN.md`. Values are concept-stage (`{token.refs}` unresolved); nothing in `apps/hanse` is required to follow it yet.

## Overview

Riprap reads like an engineering section drawing that happens to be a website. The base canvas is near-black ground `{colors.canvas}` (#0C0E10) holding warm-white ink `{colors.ink}` (#F2EFE8). The brand voltage is **structural, not chromatic**: stone-grey hairlines, one harbor-blue accent, and monospaced numbers as the hero of every surface. There are no gradients, no glow, no shadows, no pastel atmosphere — depth comes from tone steps and 1px rules, the way a blueprint reads.

Type pairs **Space Grotesk** (700 display, 400/500 body) with **JetBrains Mono** for every number, label, stamp, and parameter. Display is bold and tightly tracked — the wordmark's letters nearly touch, and display type inherits that kiss. Uppercase belongs to mono only (stamps, badges); grotesque headlines stay lowercase or sentence case.

CTAs are structural: a warm-white block button (`{component.button-primary}`) is the primary, a 1px stone-bordered outline (`{component.button-outline}`) is the secondary, a harbor-blue text link is the tertiary. Harbor-blue is an accent (the crest stone, links, stamps) — never a button fill, never a background, never body text.

Motion law: **settle, not slide**. Elements drop and stop; nothing bounces, glows, or slides. The mark assembles on load and can dissolve on pool-close pages — the only brand in the room whose logo's end state is its product promise.

**Key Characteristics:**
- Near-black ground, warm-white ink, stone-grey hairlines. One accent: harbor-blue.
- Numbers are the hero — every numeral renders in JetBrains Mono and arrives on screen one at a time.
- Display runs Space Grotesk 700, tightly tracked (-0.04em at wordmark scale). Never light weights on dark canvas.
- Sharp geometry: 0px radius on stamps and CTAs; hairline borders instead of shadows.
- The logomark — **the ring** — is an open circle of 7 grey stones around a protected middle, one slot deliberately empty (open membership), one harbor-blue stone settled beside the gap (the newest member). It appears settled; it may assemble or dissolve, never float, spin, or glow. Community, solidarity, communality: each stone is held in the ring by its neighbors.
- 80px section rhythm with 1px stone rules between bands — the section-drawing grid.
- Deadpan register everywhere: no fear imagery, no knives, no dramatized peril (messaging guide §Register Guardrails).

## Colors

### Brand & Accent
- **Ink Primary** (`{colors.primary}` — #F2EFE8): The primary action color — warm-white block button on dark ground. Used scarcely.
- **Ink Primary Active** (`{colors.primary-active}` — #FBF9F3): Press state.
- **Accent Harbor-Blue** (`{colors.accent}` — #3E7CA6): the newest-member stone in the ring, text links, stamps. Accent only — never a fill for buttons or surfaces, never body text.
- **Accent Harbor-Blue Hover** (`{colors.accent-hover}` — #4E8FBA): Link hover.

### Surface (dark-first)
- **Ground** (`{colors.canvas}` — #0C0E10): Page floor — near-black, never pure black.
- **Ground Soft** (`{colors.canvas-soft}` — #101317): Subtle alternating band.
- **Ground Deep** (`{colors.canvas-deep}` — #08090B): Rare emphasis band (dissolution end-state).
- **Surface Card** (`{colors.surface-card}` — #17191D): Card on dark canvas.
- **Surface Strong** (`{colors.surface-strong}` — #1E2126): Badges, number plates, diagram fills.

### Light Inversion (secondary — print, docs, email)
- **Paper** (`{colors.paper}` — #F2EFE8): Light page floor.
- **Paper Soft** (`{colors.paper-soft}` — #F7F5F0): Alternating light band.
- **Ink Dark** (`{colors.ink-dark}` — #14171A): Text and primary button fill on light.
- **Harbor-Blue Deep** (`{colors.accent-deep}` — #2E6488): Accent on light ground.

### Hairlines
- **Hairline** (`{colors.hairline}` — #2A2E33): Default 1px divider on dark.
- **Hairline Soft** (`{colors.hairline-soft}` — #22262B): Lighter rule.
- **Hairline Strong** (`{colors.hairline-strong}` — #3A3F45): Stamp and panel outlines on dark.
- **Hairline Light** (`{colors.hairline-light}` — #D9D4CB): Default divider on paper.

### Text
- **Ink** (`{colors.ink}` — #F2EFE8): Display, primary text. Warm, never pure white.
- **Body** (`{colors.body}` — #C9CDD1): Running text on dark.
- **Muted** (`{colors.muted}` — #8A9096): Sub-titles, secondary labels.
- **Muted Soft** (`{colors.muted-soft}` — #6E747A): Disabled text.
- **Stone** (`{colors.stone}` — #A7ADB3): The mark's stones, midtone labels.
- **On Primary** (`{colors.on-primary}` — #0C0E10): Text on the warm-white button.

### Semantic (provisional — see Known Gaps)
- **Success** (`{colors.semantic-success}` — #5B8C6A): Confirmation, settled states.
- **Error** (`{colors.semantic-error}` — #C0533E): Validation errors.

## Typography

### Font Family
**Space Grotesk** (SIL OFL — self-host) at 700 for display, 400/500 for body, navigation, buttons. **JetBrains Mono** (SIL OFL) at 500/600 for every number, mechanism label, parameter (`{{EVENT}}`-style), stamp, and address. Fallback: `system-ui, sans-serif` for Space Grotesk; `ui-monospace, monospace` for JetBrains Mono.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-mega}` | 64px | 700 | 1.05 | -2.56px | Homepage hero h1 |
| `{typography.display-xl}` | 48px | 700 | 1.08 | -1.44px | Subsidiary heroes |
| `{typography.display-lg}` | 36px | 700 | 1.15 | -0.72px | Section heads |
| `{typography.display-md}` | 32px | 700 | 1.2 | -0.64px | Sub-section heads |
| `{typography.display-sm}` | 24px | 700 | 1.25 | -0.24px | Card group titles |
| `{typography.title-md}` | 20px | 500 | 1.35 | 0 | Component titles |
| `{typography.title-sm}` | 18px | 500 | 1.44 | 0 | List labels |
| `{typography.body-md}` | 16px | 400 | 1.55 | 0 | Default body |
| `{typography.body-strong}` | 16px | 500 | 1.55 | 0 | Emphasized body |
| `{typography.body-sm}` | 15px | 400 | 1.5 | 0 | Footer body |
| `{typography.mono-label}` | 12px | 600 | 1.4 | +0.8px | Uppercase stamps, section labels, badges — JetBrains Mono |
| `{typography.mono-number}` | 20px | 600 | 1.2 | 0 | Numbers as hero — JetBrains Mono |
| `{typography.mono-number-lg}` | 32px | 600 | 1.1 | -0.32px | Tier prices/caps, pool math — JetBrains Mono |
| `{typography.button}` | 15px | 500 | 1.0 | 0 | CTA block |
| `{typography.nav-link}` | 14px | 500 | 1.4 | +0.2px | Top-nav menu |

### Principles
- **Every numeral renders in JetBrains Mono** — inline in body text too. Numbers are the hero (messaging guide: numbers over adjectives).
- **Display stays 700 and tightly tracked.** The wordmark sets tight enough for letters to nearly touch (-0.04em); display type inherits the tension. Never light display weights on the dark canvas.
- **Uppercase is mono-only.** Stamps, badges, and section labels are uppercase JetBrains Mono; grotesque headlines are lowercase or sentence case.
- **No second decorative face.** Two families, both OFL, both self-hosted.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.base}` 16px · `{spacing.md}` 20px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- **Section padding:** 80px with a 1px `{colors.hairline}` rule between bands.

### Grid & Container
- Max content width: ~1200px.
- 12-column grid; mechanism diagrams align to the same column grid as copy.
- Tier and feature grids: 3-up at desktop ($10/$20/$40 tiers).
- Footer: 4-column link list + dissolution line.

### Whitespace Philosophy
Engineering-drawing pacing — generous bands separated by hairline rules, not shadows or fills. Numbers get the largest fields: a worked-example band is mostly empty ground with one mono figure at a time arriving into it.

## Elevation & Depth

The system uses **tone steps + hairlines only**. No drop shadows, no glows, no gradients — banned outright (visual identity §02). A card is visible because it is a lighter tone than the ground and carries a 1px rule, the way a section drawing separates fill from hatch.

| Level | Treatment | Use |
|---|---|---|
| Flat (ground) | `{colors.canvas}` (#0C0E10) | Body bands, footer |
| Band | `{colors.canvas-soft}` (#101317) | Alternating sections |
| Card | `{colors.surface-card}` (#17191D) + 1px `{colors.hairline}` | Content cards |
| Plate | `{colors.surface-strong}` (#1E2126) | Number plates, diagram fills |
| Deep | `{colors.canvas-deep}` (#08090B) | Dissolution end-state band |

### Decorative Depth
- **The ring** is the only decorative element: the open stone circle (7 grey stones, 1 empty slot, 1 harbor-blue newest member) as a corner anchor or section divider. It settles or dissolves; it never floats, rotates, or glows. Kit components: `Logomark`, `Wordmark`, `LogoLockup` (`@riprap/ui`); the wordmark asset lives at `meta/marketing/07-brand-assets/logo/wordmark.svg`.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | **Default**: stamps, buttons, cards, badges — sharp section-drawing geometry |
| `{rounded.xs}` | 2px | Form inputs (optical relief only) |
| `{rounded.full}` | 9999px | The avatar disc — the only circle |

Illustration atoms (diagrams, claim-flow scenes) follow the separate primitives spec (`meta/primitives/composition.md`: stroke 3, radius 12) — that system is for drawings, not UI chrome.

## Components

### Top Navigation

**`top-nav`** — Background `{colors.canvas}`, text `{colors.ink}`, height 64px, 1px `{colors.hairline}` bottom rule. Layout: `lockup-horizontal` (mark + riprap wordmark) left, mono nav links (`Platform / How it works / Blade Pool / FAQ`), Sign In + "Join the pool" primary CTA right.

### Buttons

**`button-primary`** — Warm-white block. Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}`, padding 10px × 20px, height 40px, radius `{rounded.none}`.

**`button-primary-active`** — Press state. Background `{colors.primary-active}`.

**`button-outline`** — Transparent block with 1px stone border. Background transparent, text `{colors.ink}`, 1px `{colors.hairline-strong}` border, radius `{rounded.none}`.

**`button-tertiary-text`** — Inline harbor-blue text link (`{colors.accent}`, hover `{colors.accent-hover}`).

### Hero & Brand

**`hero-band`** — Background `{colors.canvas}`, left-aligned display headline in `{typography.display-mega}`, subhead in `{typography.body-md}`, two CTAs. The ring assembles bottom-right on load (see Motion). No orb, no gradient, no photo.

**`stamp-badge`** — The instance lockup element: uppercase JetBrains Mono `{typography.mono-label}` in harbor-blue, 1px `{colors.hairline-strong}` border, radius `{rounded.none}`, padding 6px × 12px. Pattern: `: BLADE POOL @ BREAKPOINT`. Mirrors the logo's instance stamp (`logo/lockup-instance.svg`).

**`mechanism-card`** — Flat wireframe diagram card (two-doors vault, juror state machine, appeal ladder). Background `{colors.surface-card}`, 1px hairline, radius `{rounded.none}`. Drawn, not decorated — if an icon needs a gradient to read, it's wrong.

### Cards

**`tier-card`** — Coverage tier card. Background `{colors.surface-card}`, 1px hairline, radius `{rounded.none}`, padding 32px. Entry fee in `{typography.mono-number-lg}`, max payout in `{typography.mono-number-lg}`, tier name in `{typography.mono-label}`. Numbers are the hero; no illustration inside the card.

**`feature-card`** — 3-up grids. Background `{colors.surface-card}`, text `{colors.ink}`, radius `{rounded.none}`, padding 24px, 1px hairline border.

**`worked-example-receipt`** — The pool math as a bill: line items in reading order, each a mono caption left of a dotted leader and a `{typography.mono-number}` value right; the closing figure sits under a hairline rule in `{typography.mono-number-lg}`, like a total. Card ground + 1px hairline, radius `{rounded.none}`; one line arrives at a time and settles, total last.

### Forms & Tags

**`text-input`** — Background `{colors.surface-card}`, text `{colors.ink}`, radius `{rounded.xs}` (2px), padding 12px × 16px, height 44px, 1px `{colors.hairline-strong}` border. On focus, border thickens to 2px `{colors.stone}`.

**`badge-pill`** → **`badge-stamp`** — Background transparent, text `{colors.stone}`, type `{typography.mono-label}`, 1px `{colors.hairline}` border, radius `{rounded.none}`, padding 4px × 10px. Stamps, never pills.

### CTA / Footer

**`cta-band`** — Pre-footer. Background `{colors.canvas-soft}`, centered display headline in `{typography.display-lg}`, single warm-white CTA. 80px padding, hairline rules above and below.

**`footer`** — Background `{colors.canvas}`, text `{colors.muted}`. 4-column link list, wordmark + "Event mutuals on Solana." line, and the closing fact in mono: `dead on schedule`. 64×48px padding.

**`dissolution-band`** — Post-pool end-state only. Background `{colors.canvas-deep}`, the mark in scattered state, `{typography.mono-number}` `$0 remaining`, dissolution line in `{typography.body-sm}`. Used on dead-pool pages — the brand's signature moment; never on evergreen pages.

## Motion

- **Law: settle, not slide.** Elements drop into place and stop. Ease-out, ~160ms. No bounce, no elastic, no glow, no parallax.
- **Assemble (hero load, pool opens):** the ring's stones drop-settle in clockwise sequence, ~40ms stagger, the harbor-blue newest member last. Position only — no rotation, no scale.
- **Numbers arrive one at a time.** In worked-example bands each mono figure settles before the next appears.
- **Dissolve (claims window close, dead-pool pages):** stones scatter off-frame and the composition dereferences. Favicon and print are always the settled state.
- **Exception — the covered overlay (2026-09-21, Fabian's call):** the one sanctioned departure. The join moment (`CoveredOverlay`, kit) borrows the demo choreography: bounce-in shield, one glow flash at impact (shield halo + headline halo), an ambient hairline ring emission loop while open, confetti in brand tokens (ink/accent/stone/muted), and a blurred fullscreen scrim. The scene runs peril-token diamond → deflection → the ring closes (settle law) → copy. Reduced motion renders the settled composite; everywhere else the settle law above is unchanged and absolute.

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (warm-white block) for primary CTAs.
- Use Space Grotesk 700, tightly tracked, for every display headline.
- Render every numeral in JetBrains Mono — inline in body text too.
- Use harbor-blue for exactly three things: the ring's newest-member stone, text links, stamps.
- Use 1px hairlines and tone steps for all separation and depth.
- Name the peril plainly in body copy ("knife assault"); keep names/headlines to the instance pattern ("Blade Pool").

### Don't
- Don't introduce a second accent, a gradient, a glow, a shadow, or Solana purple/green. Harbor-blue on near-black is the committed palette.
- Don't use harbor-blue as a button fill, surface fill, or body text — accent only (visual identity §03).
- Don't use pill radii, soft shadows, or bounce easings. Sharp geometry; settle, not slide.
- Don't set grotesque type in uppercase — uppercase belongs to mono stamps only.
- Don't show knives, blades, injuries, or storm drama in any visual. Type, stones, water, diagrams only.
- Don't dramatize or joke about the peril anywhere in the UI (messaging guide §Register Guardrails).
- Don't imply coverage the policy doesn't grant: payout ceilings are stated with caps ("up to $2,000"), the pool's mortality is stated, "insurance" is never used to describe Riprap.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 640px | Hero h1 64→32px; tier cards 1-up; nav hamburger; mark anchors hide. |
| Tablet | 640–1024px | Hero h1 48px; tier cards 2-up. |
| Desktop | 1024–1280px | Full hero h1 64px; tier cards 3-up. |
| Wide | > 1280px | Content caps at 1200px. |

### Touch Targets
- Primary block button at 40px height — at WCAG AA, padded for AAA.
- Stamps and mono labels padded to effective 44px tap zones when interactive.

### Collapsing Strategy
- Top nav switches to hamburger below 768px; nav links stay mono.
- Tier grid: 3-up → 2-up → 1-up.
- Worked-example band figures stack vertically; arrival order preserved.

## Iteration Guide

1. Focus on a single component at a time.
2. CTAs default to `{rounded.none}`. Cards use `{rounded.none}` + hairline.
3. Variants live as separate entries.
4. Use `{token.refs}` everywhere — never inline hex.
5. Hover states: border-tone shift or `{colors.accent-hover}` only — never a new shadow.
6. Space Grotesk 700 for display, 400/500 body; JetBrains Mono for anything numeric or stamped.
7. When a surface needs a diagram, draw it per `meta/primitives/` (atoms + composition grammar) — don't improvise a new illustration style.

## Known Gaps

- No product UI exists yet — this system covers the marketing site and print/elective surfaces; join/claim/juror screens get added when the app ships (screenshot placeholders in `meta/marketing/README.md`).
- Semantic success/error tones are provisional desaturated values, not brand-reviewed.
- Light-mode (paper) inversions are tokenized but untested on a real page.
- The wordmark skew (-3.5°) and r→a kiss are concept-stage values (`visual-identity.md` open item 1); UI uses the logo SVGs as-is, never re-typesets the wordmark.
- Exact motion curves beyond "ease-out ~160ms, settle not slide" are unspecified.
