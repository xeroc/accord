---
marp: true
theme: default
size: 16:9
paginate: true
footer: 'Accord · Mechanize the verdict.'
---

<!--
  Accord — Pitch Deck
  Methodology: pitch-deck skill (one-liner, Pixar blurb, real headlines, no buzzwords,
               black bg / white font, no branding).
  Format:      Marp markdown (single file, embedded minimal-dark CSS).
               marp accord-pitch.md -o accord-pitch.html --html
               marp accord-pitch.md --pdf --allow-local-files
-->

<style>
:root {
  --bg:        #0b0b0d;
  --fg:        #d0d0d2;
  --fg-dim:    #8b949e;
  --head:      #ffffff;
  --accent:    #58a6ff;
  --rule:      #2a2a30;
}

section {
  background-color: var(--bg);
  color: var(--fg);
  font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-weight: 400;
  font-size: 23px;
  line-height: 1.55;
  box-sizing: border-box;
  padding: 60px 72px;
  position: relative;
}

/* Headings: white, strong hierarchy, no decoration */
h1, h2, h3 {
  font-weight: 800;
  color: var(--head);
  margin: 0;
  letter-spacing: -0.01em;
}

h1 { font-size: 60px; line-height: 1.12; }

/* Slide titles sit at top with a single thin accent rule */
h2 {
  font-size: 40px;
  line-height: 1.15;
}
h2::after {
  content: '';
  display: block;
  width: 56px;
  height: 3px;
  margin-top: 16px;
  background: var(--accent);
}
h2 + * { margin-top: 30px; }

h3 {
  font-size: 26px;
  color: var(--accent);
  margin: 22px 0 10px;
}

/* Bullets: tight, parallel */
ul, ol { padding-left: 28px; margin: 0; }
li { margin-bottom: 9px; }
li::marker { color: var(--accent); }

/* One accent for emphasis only */
strong { color: var(--accent); font-weight: 700; }

/* Secondary copy */
em { color: var(--fg-dim); font-style: normal; }

code {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
  font-size: 0.82em;
  color: var(--head);
  background: #16161a;
  border: 1px solid var(--rule);
  border-radius: 5px;
  padding: 1px 6px;
}
pre {
  background: #16161a;
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 18px 20px;
  font-size: 17px;
  line-height: 1.5;
  margin: 12px 0;
}
pre code { background: none; border: none; padding: 0; }

/* Flow pill row */
.flow {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
}
.flow span {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 16px;
  color: var(--head);
  background: #16161a;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 6px 14px;
}
.flow i { color: var(--accent); font-style: normal; font-size: 18px; }

/* Footer + pagination: minimal */
footer {
  color: var(--fg-dim);
  font-size: 13px;
  font-family: 'JetBrains Mono', Consolas, monospace;
}
section::after {
  color: var(--fg-dim);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
}

/* Lead (title / closing) slides: centered, no footer, no chrome */
section.lead {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
section.lead h1 { font-size: 72px; }
section.lead h2::after { display: none; }
section.lead footer,
section.lead::after { display: none; }
section.lead .oneliner {
  font-size: 34px;
  font-weight: 800;
  color: var(--accent);
  margin-top: 14px;
}
section.lead .sub {
  font-size: 22px;
  color: var(--fg-dim);
  margin-top: 18px;
}
</style>

<!-- _class: lead -->
<!-- _paginate: false -->

# Accord

<div class="oneliner">Mechanize the verdict.</div>

<div class="sub">Schelling-point arbitration, natively onchain.</div>

---

## Solana has no onchain court

- Subjective disputes are everywhere — escrow, insurance, NFT authenticity, oracle calls
- Smart contracts **execute**; they can't **judge intent**
- Today: a trusted multisig — or nothing
- Kleros solved this on Ethereum (2019, 1,000+ disputes)
- **Solana has no native equivalent.**

---

## Honesty is the profitable vote

The **Schelling Point**: strangers converge on truth without talking.

- Jurors **stake capital**, drawn at random by weight
- Vote with the majority → earn fees + slashed stake
- Vote against → lose a slice of your own
- **Truth pays.** No central judge picks winners.

---

## File, draw, commit, reveal, rule

<div class="flow">
  <span>file</span><i>→</i><span>draw</span><i>→</i><span>commit</span><i>→</i><span>reveal</span><i>→</i><span>rule</span><i>→</i><span>appeal</span>
</div>

- Any program **files** a dispute via CPI
- **N jurors drawn** — VRF, stake-weighted
- Each **commits** `hash(vote, salt)` — votes stay secret
- Jurors **reveal** — majority becomes the onchain Ruling
- **Appeal** → 2N+1 jurors (3→7→15→31). Bribery gets exponential.

---

## Two CPI calls. That's the integration

```
// any Arbitrable program — you file:
accord.create_dispute(subaccord, options, evidence_hash, fee)

// ...time passes, jurors vote privately...

// you read the verdict, lazily:
let winner = accord.get_ruling(dispute_id)
```

- The Accord knows **nothing** about your domain
- You know **nothing** about the jurors
- **Plug it into anything**

---

## Built for Solana, not ported

- **VRF** draws — manipulation-resistant
- **Per-Subaccord staking token** (USDC default, any SPL)
- **Verifiable sortition** — MST-committed, provably fair
- **Permissionless Subaccords** — specialized juror pools
- **Commit-reveal** so votes can't be copied

---

## Hard to buy, hard to game

- **Secret commits** — can't copy the majority
- **Exponential appeals** — 31 jurors ≫ 3 to bribe
- **Slashed stake + bonds** flow to honest jurors
- Risk is **per-Subaccord**, not one capturable pool
- Every crank is **permissionless**

---

## Anything that needs a referee

- **Freelance escrow** — "did the dev deliver?"
- **DeFi insurance** — "was this exploit in scope?"
- **Curated lists** — "does this token belong?"
- **Prediction markets** — "did it resolve YES?"
- **DAO governance** — "was this proposal executed correctly?"

One primitive. Every subjective question.

---

## The hole is getting bigger

- DeFi insurance, escrow, prediction markets — all growing on Solana
- Each needs a trustless **"who is right?"**
- **Zero** native Schelling arbitration exists today
- Kleros proved the model: $5M+ disputes, profitable jurors
- **First native implementation wins the layer**

---

## Accord first, then depth

- **v1 — now:** the arbitration primitive. *This deck.*
- **v2:** Arcium encrypted vote-tally, accord token, tranched staking
- **v3:** futarchy, evidence markets, AI risk pricing, ZK
- Ship the primitive — protocols plug in on top

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Dr.-Ing. Fabian Schuh

<div class="oneliner">Let's build the court Solana is missing.</div>

<div class="sub">
Decades in blockchain, security & operations.<br/>
Seeking: integrators, grants, feedback.<br/>
<em>github.com · veridao · 2026</em>
</div>
