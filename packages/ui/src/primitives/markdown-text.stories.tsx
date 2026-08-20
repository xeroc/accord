import type { Meta, StoryObj } from "@storybook/react-vite";

import { MarkdownText } from "./markdown-text";

const meta = {
  title: "Primitives/MarkdownText",
  component: MarkdownText,
  argTypes: {
    source: { control: "text" },
  },
} satisfies Meta<typeof MarkdownText>;

export default meta;
type Story = StoryObj<typeof MarkdownText>;

/** Evidence-manifest / domain-doc style description: headings, lists, links. */
export const Description: Story = {
  render: () => (
    <div className="max-w-md rounded-lg border border-border bg-card p-4">
      <MarkdownText
        source={
          "## Item challenge\n\nThe item **violates rule 3** of the list charter (`no self-promotion`).\n\n- [Evidence thread](https://accord.example)\n- Filed 2026-08-19\n"
        }
      />
    </div>
  ),
};

/** Malicious source stays inert: raw HTML escaped, `javascript:` stripped. */
export const Untrusted: Story = {
  render: () => (
    <div className="max-w-md rounded-lg border border-border bg-card p-4">
      <MarkdownText
        source={
          "<script>alert(1)</script>\n\n[x](javascript:alert(1)) — stays inert"
        }
      />
    </div>
  ),
};
