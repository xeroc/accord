import { AccordMark } from "@useaccord/ui";

// Edge-aligned mono status bar, per the landing app's nav — no
// how-it-works, no Open App: Docs, GitHub, Telegram only.
const links = [
  { href: "https://docs.useaccord.xyz", label: "Docs" },
  { href: "https://github.com/xeroc/accord", label: "GitHub" },
  { href: "https://t.me/useaccord", label: "Telegram" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-ink/80 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/70 [@media(prefers-reduced-transparency:reduce)]:bg-ink [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <a href="/#hero" className="flex items-center gap-2.5" aria-label="Hanse — home">
          <AccordMark size={20} />
          <span className="font-mono text-sm font-medium tracking-tight text-nearwhite">Hanse</span>
          <span className="ml-2 hidden items-center gap-1.5 font-mono text-xs text-muted-foreground sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-amber"></span>spec complete · in implementation
          </span>
        </a>
        <nav className="flex items-center gap-5 font-mono text-sm text-muted-foreground">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-nearwhite"
              rel="noopener"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
