import { FileTextIcon, CircleSlashIcon, TimerIcon, GitBranchIcon } from "lucide-react"
import type { Meta, StoryObj } from "@storybook/react-vite";

import { IconTile } from "./icon-tile";

const meta = {
  title: "ReUI/Icon Tile",
  component: IconTile,
  argTypes: {
    variant: {
      control: "select",
      options: ["outline", "elevated", "soft", "solid", "frame"],
    },
    size: { control: "select", options: ["xs", "sm", "default", "lg", "xl"] },
    radius: { control: "select", options: ["default", "full"] },
  },
  args: { children: <FileTextIcon /> },
} satisfies Meta<typeof IconTile>;

export default meta;
type Story = StoryObj<typeof IconTile>;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <IconTile variant="outline">
        <FileTextIcon />
      </IconTile>
      <IconTile variant="elevated">
        <FileTextIcon />
      </IconTile>
      <IconTile variant="soft">
        <FileTextIcon />
      </IconTile>
      <IconTile variant="solid">
        <FileTextIcon />
      </IconTile>
      <IconTile variant="frame">
        <FileTextIcon />
      </IconTile>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {(["xs", "sm", "default", "lg", "xl"] as const).map((size) => (
        <IconTile key={size} size={size}>
          <FileTextIcon />
        </IconTile>
      ))}
    </div>
  ),
};

/** The jurat-section vocabulary — one glyph per capability claim, all on
 * the identity accent (state colors stay restricted to state, per the
 * brand law in tokens.css). */
export const JuratCapabilities: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <IconTile variant="soft">
        <FileTextIcon />
      </IconTile>
      <IconTile variant="soft">
        <TimerIcon />
      </IconTile>
      <IconTile variant="soft">
        <CircleSlashIcon />
      </IconTile>
      <IconTile variant="frame">
        <GitBranchIcon />
      </IconTile>
    </div>
  ),
};
