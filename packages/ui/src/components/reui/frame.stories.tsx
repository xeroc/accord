import { FileTextIcon } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { IconTile } from "./icon-tile";
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "./frame";

const meta = {
  title: "ReUI/Frame",
  component: Frame,
  argTypes: {
    variant: { control: "select", options: ["default", "ghost"] },
    spacing: { control: "select", options: ["sm", "default", "lg"] },
    stacked: { control: "boolean" },
    dense: { control: "boolean" },
  },
} satisfies Meta<typeof Frame>;

export default meta;
type Story = StoryObj<typeof Frame>;

/** One capability card as the jurat section composes them. */
export const CapabilityCard: Story = {
  render: () => (
    <Frame className="w-80">
      <FramePanel>
        <FrameHeader>
          <IconTile variant="soft" className="mb-3">
            <FileTextIcon />
          </IconTile>
          <FrameTitle>Reads every page</FrameTitle>
          <FrameDescription>
            The full evidence bundle goes in — contracts, transcripts, logs. Nothing skimmed.
          </FrameDescription>
        </FrameHeader>
        <FrameFooter>jurat · dry-run by default</FrameFooter>
      </FramePanel>
    </Frame>
  ),
};

export const Stacked: Story = {
  render: () => (
    /* section scopes the per-panel <header>s — mirrors app usage, where
     * frames always live inside a sectioning element (axe: headers nested
     * in sectioning content are not banner landmarks). */
    <section className="w-80">
      <Frame stacked>
        <FramePanel>
          <FrameHeader>
            <FrameTitle>Scan</FrameTitle>
            <FrameDescription>Watches for its own seats being drawn.</FrameDescription>
          </FrameHeader>
        </FramePanel>
        <FramePanel>
          <FrameHeader>
            <FrameTitle>Verdict</FrameTitle>
            <FrameDescription>Agent over the decrypted evidence bundle.</FrameDescription>
          </FrameHeader>
        </FramePanel>
        <FramePanel>
          <FrameHeader>
            <FrameTitle>Commit · Reveal</FrameTitle>
            <FrameDescription>Sealed vote, revealed on schedule.</FrameDescription>
          </FrameHeader>
        </FramePanel>
      </Frame>
    </section>
  ),
};
