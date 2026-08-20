import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * Foundations/Tokens — the canonical design tokens (src/styles/tokens.css),
 * rendered live: every value below is read from the computed :root style at
 * render time, so this page can never drift from the CSS. If a token changes
 * shape or disappears, the story breaks instead of silently lying.
 *
 * This is the page apps link to when a review asks "which gray do I use?".
 */

const COLOR_TOKENS = [
  { name: "--accord-ink", use: "primary surface" },
  { name: "--accord-raised", use: "cards, popovers" },
  { name: "--accord-border", use: "hairlines, dividers" },
  { name: "--accord-amber", use: "identity accent / primary" },
  { name: "--accord-confirm", use: "state: success" },
  { name: "--accord-slash", use: "state: destructive" },
  { name: "--accord-muted", use: "muted text" },
  { name: "--accord-text-secondary", use: "secondary text" },
  { name: "--accord-text-primary", use: "primary text" },
  { name: "--accord-body", use: "body text" },
  { name: "--accord-nearwhite", use: "headlines" },
  { name: "--accord-paper", use: "rare light surface" },
] as const;

const RADIUS_TOKENS = ["--accord-radius"] as const;

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function Swatch({ name, use }: { name: string; use: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden
        className="size-10 shrink-0 rounded-lg border border-border"
        style={{ backgroundColor: `var(${name})` }}
      />
      <div className="flex flex-col">
        <code className="font-mono text-sm text-text-primary">{name}</code>
        <span className="text-xs text-muted-foreground">
          {use} · {token(name)}
        </span>
      </div>
    </div>
  );
}

function TokensPage() {
  return (
    <div className="flex flex-col gap-10 p-2">
      <section>
        <h2 className="mb-4 font-mono text-sm text-amber">Color</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_TOKENS.map((c) => (
            <Swatch key={c.name} {...c} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-sm text-amber">Type</h2>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xl text-nearwhite" style={{ fontFamily: "var(--accord-font-sans)" }}>
              IBM Plex Sans — headlines &amp; body
            </p>
            <span className="text-xs text-muted-foreground">
              --accord-font-sans · {token("--accord-font-sans")}
            </span>
          </div>
          <div>
            <p className="font-mono text-base text-text-primary">
              IBM Plex Mono — labels, stats, code
            </p>
            <span className="text-xs text-muted-foreground">
              --accord-font-mono · {token("--accord-font-mono")}
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-sm text-amber">Radius</h2>
        <div className="flex items-end gap-4">
          {RADIUS_TOKENS.map((name) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <div
                aria-hidden
                className="size-14 border border-border bg-raised"
                style={{ borderRadius: `var(${name})` }}
              />
              <code className="font-mono text-xs text-muted-foreground">
                {name} · {token(name)}
              </code>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <div aria-hidden className="size-14 rounded-lg border border-border bg-raised" />
            <code className="font-mono text-xs text-muted-foreground">
              rounded-lg (= var(--accord-radius))
            </code>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-sm text-amber">Motion</h2>
        <div className="flex flex-col gap-2">
          <code className="font-mono text-xs text-muted-foreground">
            --accord-ease-expo · {token("--accord-ease-expo")}
          </code>
          <div
            aria-hidden
            className="h-2 w-64 rounded-full bg-amber"
            style={{
              animation:
                "tokens-slide 2.2s var(--accord-ease-expo) infinite alternate",
            }}
          />
          <style>{`@keyframes tokens-slide { from { transform: translateX(0); } to { transform: translateX(120px); } }`}</style>
          <span className="text-xs text-muted-foreground">
            Exponential ease-out — the terminal-feel curve every kit motion uses.
          </span>
        </div>
      </section>
    </div>
  );
}

const meta = {
  title: "Foundations/Tokens",
  component: TokensPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TokensPage>;

export default meta;
type Story = StoryObj<typeof TokensPage>;

export const Overview: Story = {};
