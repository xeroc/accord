// §6 — Who it's for. Single-audience focus + honest scope.
export function Audience() {
  return (
    <section id="audience" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          The integrator.
        </h2>

        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-body">
          The protocol builder who'd rather replace human judgment with aligned incentives than staff a
          multisig. The Mechanist — who reads the program before the pitch and adopts a primitive by
          committing a CPI call, not by signing up.
        </p>

        <p className="mt-6 max-w-2xl text-base text-muted-foreground">
          Behind them, when v1 ships: the{" "}
          <span className="text-nearwhite">Juror</span> <span className="text-muted-foreground">(earns by being honest)</span>{" "}
          and the <span className="text-nearwhite">Subaccord Creator</span>{" "}
          <span className="text-muted-foreground">(founds a scoped arbitration community)</span>.
        </p>

        <div className="mt-12 max-w-2xl rounded-lg border border-border bg-raised px-6 py-5">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">Honest scope</p>
          <p className="mt-2 text-sm leading-relaxed text-body">
            Accord is pre-launch. The v1 instruction set is the build target, not a shipped product. No
            dispute counts, no TVL, no "trusted by" logos — because none exist yet. Read the spec. Follow
            the build.
          </p>
        </div>
      </div>
    </section>
  );
}
