# @useaccord/pitch — the demo-day deck

A full-viewport slide deck built from `meta/PITCH-MUTUAL.md`
(mutual-led: the ICMIF mutual-economy numbers open the market story,
on-chain mutuals are the near term, insurance the vision; primitives
de-named on stage), rendered entirely with `@useaccord/ui`: one kit
`Backdrop` runs behind the whole deck, and every mechanism visual is
a kit piece (`PanelLadder`, `PayoutFlow`, `ChainStrip`,
`LedgerCounter`, `MonoChip`) driven by a slide-local frame clock — so
each animation replays every time its slide is entered.

```bash
pnpm --filter @useaccord/pitch dev        # present locally
pnpm --filter @useaccord/pitch build      # static dist/
pnpm --filter @useaccord/pitch lint
```

## Driving it

- `→` / `Space` / `PageDown` — next slide
- `←` / `PageUp` — previous slide
- `Home` / `End` — first / last
- `N` — toggle the presenter notes (from the pitch doc's guidance)
- dots — jump to a slide

## Structure

```
src/
  deck/slides.tsx      the nine slides + speaker notes (the content)
  deck/useSlideFrame   slide-local frame clock (replays per visit; settles
                       for prefers-reduced-motion)
```

Copy rules (from the source doc): one idea + one visual per slide,
complete-sentence headlines, dated figures only. The primitives stay
de-named on stage ("the payment rail", "the dispute layer").
Regulated-sector vocabulary (insurance, policy, premium, indemnity,
underwriting) never describes the product — it may describe the
traditional market we compare against; for the product say pooled
cover, contribution, member, payout, pool surplus. Updating the
pitch content means editing `deck/slides.tsx`; the mechanism
visuals are props on kit components.
