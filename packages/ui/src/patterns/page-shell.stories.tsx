import type { Meta, StoryObj } from "@storybook/react-vite";

import { PageShell } from "./page-shell";
import { ProductNavbar } from "./product-navbar";

const meta = {
  title: "Patterns/PageShell",
  component: PageShell,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "App page frame: optional header slot (typically `<Navbar />`) + the centered `max-w-6xl` `<main>` container. `contentClassName` merges into the main classes; extra div props land on the wrapper.",
      },
    },
  },
} satisfies Meta<typeof PageShell>;

export default meta;
type Story = StoryObj<typeof PageShell>;

function PageBody() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-mono text-2xl">Dispute #1042</h1>
      <p className="text-sm text-muted-foreground">
        Page content sits inside the centered, max-w-6xl container.
      </p>
    </div>
  );
}

/** With header — the standard app frame (navbar + main). */
export const WithHeader: Story = {
  render: () => (
    <PageShell
      header={
        <ProductNavbar
          brand={
            <a href="#" className="flex items-center gap-2 text-foreground">
              <span aria-hidden style={{ color: "var(--amber)" }}>
                ◇
              </span>
              <span className="text-lg font-bold tracking-tight">ACCORD</span>
            </a>
          }
        />
      }
    >
      <PageBody />
    </PageShell>
  ),
};

/** Without header — bare centered page (overlays, print views). */
export const WithoutHeader: Story = {
  render: () => (
    <PageShell>
      <PageBody />
    </PageShell>
  ),
};

/** contentClassName widens the container (tailwind-merge replaces max-w-6xl). */
export const WideContent: Story = {
  render: () => (
    <PageShell contentClassName="max-w-none">
      <PageBody />
    </PageShell>
  ),
};
