# @useaccord/pitch — the demo-day deck

A full-viewport slide deck: the Accord-first golden-circle pitch (grilled
outline, 2026-08-25) — WHY (the suit dispute → the disconnect) → HOW
(trusted coordination between parties that don't trust each other) →
WHAT (Accord: conflict resolution on Solana; the juror flywheel; the
four maxims) → the one named application, Hanse (1+1=3, status quo vs
$1.61T) → deployed-app links + "Mechanize the verdict." Rendered
entirely with `@useaccord/ui`: one kit `Backdrop` runs behind the whole
deck, and every mechanism visual is a kit piece (`JurorPool`,
`SealedVote`, `RulingStamp`, `VaultBox`, `LedgerCounter`, `MonoChip`)
driven by a slide-local frame clock — so each animation replays every
time its slide is entered.

```bash
pnpm --filter @useaccord/pitch dev        # present locally
pnpm --filter @useaccord/pitch build      # static dist/
pnpm --filter @useaccord/pitch lint
```

## Driving it

- `→` / `Space` / `PageDown` — next slide
- `←` / `PageUp` — previous slide
- `Home` / `End` — first / last
- `N` — toggle the presenter notes (talk track, timings, verified facts, Q&A ammo)
- dots — jump to a slide

## Structure

```
src/
  deck/slides.tsx      the ten slides + speaker notes (the content)
  deck/useSlideFrame   slide-local frame clock (replays per visit; settles
                       for prefers-reduced-motion)
public/
  suit.jpg             NATO summit, The Hague, Jun 25 2025 (Official White
                       House Photo — public domain) — the cold-open dispute
  mtndao.svg           event badge
```

Staging rules: Accord and Hanse are the only names on stage; Canon and
Tributary survive as URLs on the closing slide. No status hedging — the
deck presents conceptually (Q&A answer: devnet today, mainnet when we
pull the trigger, audits in flight). Numbers carry citations; the
cold-open facts are verified (Polymarket "Will Zelenskyy wear a suit
before July", $160M — Coindesk Jul 7 2025 via Forbes; UMA DVM ruling).
Updating the pitch content means editing `deck/slides.tsx`; the
mechanism visuals are props on kit components.
