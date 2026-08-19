import type { Preview } from "@storybook/react-vite";

import "./preview.css";

const preview: Preview = {
  //👇 Auto-generated documentation for every story file; opt out per-file
  // with tags: ["!autodocs"] on the meta.
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    // The kit is dark-first: paint the canvas with the real surface token,
    // not a hardcoded hex, so token changes propagate here too.
    backgrounds: {
      default: "ink",
      values: [{ name: "ink", value: "var(--background)" }],
    },
    docs: {
      // Long pages (Button has 10+ stories) get a jump-to-section outline.
      toc: true,
    },
    a11y: {
      // axe runs per story in the A11y panel. Radix portals (Dialog, Select,
      // Toaster) render into document.body — still covered, since axe scans
      // the whole document by default.
    },
    viewport: {
      defaultViewport: "desktop",
      viewports: {
        desktop: { name: "Desktop", styles: { width: "1280px", height: "800px" } },
        mobile: { name: "Mobile", styles: { width: "390px", height: "844px" } },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
