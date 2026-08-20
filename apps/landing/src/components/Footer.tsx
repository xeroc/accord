import { AccordMark } from "@useaccord/ui";
const year = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <a href="/#hero" className="flex items-center gap-2.5" aria-label="Accord — home">
              <AccordMark size={20} />
              <span className="font-mono text-sm font-medium tracking-tight text-nearwhite">Accord</span>
            </a>
            <p className="mt-3 font-sans text-lg font-medium text-nearwhite">Mechanize the verdict.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Schelling-point arbitration as a composable Solana primitive. Two CPI calls.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm sm:items-end" aria-label="Footer">
            <a href="/how-it-rules" className="text-muted-foreground transition-colors hover:text-nearwhite">How it Rules</a>
            <a href="https://docs.useaccord.xyz" className="text-muted-foreground transition-colors hover:text-nearwhite">Docs</a>
            <a href="https://t.me/useaccord" className="text-muted-foreground transition-colors hover:text-nearwhite" rel="noopener">Telegram</a>
            <a href="https://github.com/xeroc/accord" className="text-muted-foreground transition-colors hover:text-nearwhite" rel="noopener">GitHub</a>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-1 border-t border-border/60 pt-6 font-mono text-xs text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Accord · pre-launch · v1 is the build target</p>
          <p>useaccord.xyz</p>
        </div>
      </div>
    </footer>
  );
}
