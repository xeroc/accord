import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { PageTransition } from "./page-transition";
import { Button } from "../primitives/button";

const meta = {
  title: "Patterns/PageTransition",
  component: PageTransition,
  parameters: {
    docs: {
      description: {
        component:
          "Route-change wrapper: fade + 12px slide + blur out/in, `AnimatePresence mode=\"wait\"`. Apps keep `useLocation()` and pass `location.pathname` as `transitionKey` — the kit never imports the router.",
      },
    },
  },
} satisfies Meta<typeof PageTransition>;

export default meta;
type Story = StoryObj<typeof PageTransition>;

const PAGES = [
  { key: "/disputes", title: "Disputes", body: "Browse and file disputes." },
  { key: "/juror", title: "Juror dashboard", body: "Your stakes across subaccords." },
  { key: "/subaccords", title: "Subaccords", body: "Pools of juror consensus." },
];

/** Cycling the key remounts the page content through out→in animations. */
export const KeyChangeRemount: Story = {
  render: () => {
    const [index, setIndex] = useState(0);
    const page = PAGES[index]!;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setIndex((i) => (i + 1) % PAGES.length)}>
            Change route →
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            transitionKey=&quot;{page.key}&quot;
          </span>
        </div>
        <PageTransition transitionKey={page.key}>
          <section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10">
            <h2 className="font-mono text-lg">{page.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{page.body}</p>
          </section>
        </PageTransition>
      </div>
    );
  },
};
