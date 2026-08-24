import { AccordMark } from "@useaccord/ui";
const year = new Date().getFullYear();

const links = [
  { href: "https://docs.useaccord.xyz", label: "Docs" },
  { href: "https://t.me/useaccord", label: "Telegram" },
  { href: "https://github.com/xeroc/accord", label: "GitHub" },
  { href: "https://useaccord.xyz", label: "Accord" },
];

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <a href="/#hero" className="flex items-center gap-2.5" aria-label="Hanse — home">
              <AccordMark size={20} />
              <span className="font-mono text-sm font-medium tracking-tight text-nearwhite">Hanse</span>
            </a>
            <p className="mt-3 font-sans text-lg font-medium text-nearwhite">The protocol for mutuals.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Member-funded cover pools on Solana. One risk, one pool. Surplus
              flows back.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm sm:items-end" aria-label="Footer">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-muted-foreground transition-colors hover:text-nearwhite"
                rel="noopener"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-1 border-t border-border/60 pt-6 font-mono text-xs text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Accord · Hanse is pre-launch · mutual contract in implementation</p>
          <p>hanse.useaccord.xyz</p>
        </div>
      </div>
    </footer>
  );
}
