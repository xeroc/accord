import { Waitlist } from "./Waitlist";

// §7 — Final CTA. The campaign question as the closing hook.
export function FinalCTA() {
  return (
    <section id="cta" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-sans text-4xl font-semibold tracking-[-0.02em] text-amber sm:text-5xl">
          Who's right?
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base text-muted-foreground">
          One email when v1 ships on mainnet. That's the whole list.
        </p>

        <div className="mt-9 flex justify-center">
          <Waitlist />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <a href="https://docs.useaccord.xyz" className="text-body underline-offset-4 transition-colors hover:text-nearwhite hover:underline">Read the docs</a>
          <span className="text-border">·</span>
          <a href="https://t.me/useaccord" className="text-body underline-offset-4 transition-colors hover:text-nearwhite hover:underline" rel="noopener">Join the Telegram</a>
        </div>
      </div>
    </section>
  );
}
