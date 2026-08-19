// DESIGN.md §08: N9 edge-aligned mono status bar.
// Wordmark + convergence glyph + status chip left; links in Plex Mono right.
// No CTA-right SaaS nav.
const links = [
  { href: "https://docs.useaccord.xyz", label: "Docs" },
  { href: "https://github.com/xeroc/accord", label: "GitHub" },
  { href: "https://app.useaccord.xyz", label: "Open App" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-ink/80 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/70 [@media(prefers-reduced-transparency:reduce)]:bg-ink [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <a href="/#hero" className="flex items-center gap-2.5" aria-label="Accord — home">
          <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true" className="text-amber">
            <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" fill="none">
              <line x1="7.5" y1="8.5" x2="16" y2="16"></line>
              <line x1="24.5" y1="8.5" x2="16" y2="16"></line>
              <line x1="16" y1="25" x2="16" y2="16"></line>
            </g>
            <circle cx="16" cy="16" r="2.6" fill="currentColor"></circle>
          </svg>
          <span className="font-mono text-[15px] font-medium tracking-tight text-nearwhite">Accord</span>
          <span className="ml-2 hidden items-center gap-1.5 font-mono text-xs text-muted-foreground sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-amber"></span>v1 · build target
          </span>
        </a>
        <nav className="flex items-center gap-5 font-mono text-sm text-muted-foreground">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-nearwhite"
              rel={l.href.startsWith("http") ? "noopener" : undefined}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
