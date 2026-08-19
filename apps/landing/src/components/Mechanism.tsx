// §3 — The mechanism (Minimal: the two calls only). brand/DESIGN.md §08 website.
export function Mechanism() {
  return (
    <section id="mechanism" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-2xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          Two calls. Any program.
        </h2>

        <div className="mt-10 overflow-hidden rounded-lg border border-border bg-raised">
          <div className="border-b border-border/70 px-5 py-2">
            <span className="font-mono text-xs text-muted-foreground">arbitrable.rs</span>
          </div>
          <pre className="overflow-x-auto px-5 py-6 font-mono text-sm leading-relaxed text-body"><code><span className="text-muted-foreground">// file a dispute from any program</span>{"\n"}<span className="text-amber">create_dispute</span>(subaccord, options, evidence_hash, fee) <span className="text-muted-foreground">→</span> dispute_id{"\n\n"}<span className="text-muted-foreground">// jurors drawn by VRF · commit · reveal · slash on incoherence</span>{"\n"}<span className="text-amber">get_ruling</span>(dispute_id) <span className="text-muted-foreground">→</span> winning_option</code></pre>
        </div>

        <p className="mt-8 max-w-2xl text-lg text-body">
          Dispute resolution is a primitive — not a product you integrate, a call you make.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          The full lifecycle —{" "}
          <code className="font-mono text-muted-foreground">create_subaccord → stake → draw → commit → reveal → appeal → finalize</code>{" "}
          — lives in the <a href="https://docs.useaccord.xyz" className="text-amber underline-offset-4 hover:underline">docs</a>.
        </p>
      </div>
    </section>
  );
}
