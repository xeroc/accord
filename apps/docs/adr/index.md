# Architecture Decision Records

ADR records capture the context, options considered, and consequences of a
locked architectural choice. They are **immutable once deployed**: a superseded
decision gets a new ADR that references the old one, and the old ADR's body is
left intact (only its status banner is annotated).

ADRs in this repo are **repo-only** — they live under `apps/docs/adr/` and are
**not** served by the MkDocs docs site (`apps/docs/docs/`). They are versioned
source artifacts, read on GitHub or in an editor, and authoritative for the
design record. The docs site links out to them as references.

## Per-program series

Each program owns an independent, sequentially-numbered ADR series:

- **[Accord](accord/index.md)** — the arbitration program (Schelling-point court
  on Solana). ADRs `accord/0001`–`accord/0027`.
- **[Canon](canon/index.md)** — the curated-list registry Arbitrable. Starts
  at `canon/0001`.
- **[Synod](synod/index.md)** — the N-party dispute-escrow Arbitrable.
  ADRs `synod/0001`–`synod/0002`.

## Authoring a new ADR

1. Pick the program's series and the next sequential number for it
   (e.g. Accord → `accord/0020`, Canon → `canon/0001`).
2. Follow the format: `# Title` → decision statement → `## Considered Options`
   → `## Consequences`.
3. Add the file under the program's folder via `git mv` (or create in place):
   `apps/docs/adr/<program>/`.
4. Add a row to that program's index table.
5. Reference related ADRs and beans; if the new ADR supersedes one, annotate the
   old ADR's status banner and leave its body immutable.
