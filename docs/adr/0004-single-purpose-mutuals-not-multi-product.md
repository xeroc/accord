# Single-purpose Mutuals (not multi-product)

Each Mutual covers exactly one risk type. The factory spawns sovereign Mutuals (Car Accident Mutual, Dental Mutual, Drug-Raid Legal Defense Mutual), each with its own funds, policies, and Subaccord. There is no "cover everything" mega-entity.

## Considered Options

- **Multi-product entity** (one Mutual hosts multiple coverage products / "modules"): more capital-efficient if products are uncorrelated (a car crash and a dental claim don't correlate, so one pool diversifies). But reintroduces governance/allocation complexity and the "bad product parasitizes good products" risk — a dental fraud wave drains the shared pool that also backs car coverage.
- **Single shared pool** (Nexus Mutual model): rejected — this is the death-spiral capital model that killed Bridge/Tidal/Cover.

## Consequences

- Risk isolation is structural and free: a Car Mutual cannot be drained by a Dental Mutual's losses. Different Mutuals, different PDAs, different fund accounts.
- Each Mutual must independently attract enough capital to be solvent. Small/niche Mutuals may struggle — but "this Mutual can't stand alone" should mean "it shouldn't exist yet," not "subsidize it from other Mutuals' capital."
- Adverse selection is mitigated at the Mutual level: Stakers and Insured self-select into risk types they understand.
- Cross-Mutual diversification (the multi-product advantage) is sacrificed. Acceptable: the research showed that un-correlated arbitrary risk can't be actuarially pooled anyway.
