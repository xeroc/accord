import type { Meta, StoryObj } from "@storybook/react-vite";

import { SealedVote } from "./sealed-vote";

const meta = {
  title: "Mechanism/SealedVote",
  component: SealedVote,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 360, step: 1 } },
    hash: { control: "text" },
    vote: { control: "text" },
    commitAt: { control: { type: "number", min: 0 } },
    revealAt: { control: { type: "number", min: 0 } },
    tone: { control: "select", options: ["confirm", "slash"] },
  },
  args: {
    frame: 130,
    hash: "6f3a91c2",
    vote: "YES",
    commitAt: 100,
    revealAt: 168,
  },
} satisfies Meta<typeof SealedVote>;

export default meta;
type Story = StoryObj<typeof SealedVote>;

/** Commit phase — the hash has scrambled in and locked. */
export const Committed: Story = {
  args: { frame: 130 },
};

/** Reveal phase — the vote has flipped in over the departed hash. */
export const Revealed: Story = {
  args: { frame: 200 },
};

/** Economics land — the incoherent vote is crossed out in slash red. */
export const CrossedOut: Story = {
  args: {
    frame: 340,
    vote: "NO",
    tone: "slash",
    toneAt: 296,
    crossAt: 316,
  },
};

/** Coherent vote recolored confirm green as redistribution lands. */
export const Coherent: Story = {
  args: { frame: 340, tone: "confirm", toneAt: 296 },
};

/** The chip layout videos use under the jury cards. */
export const ChipLayout: Story = {
  args: {
    frame: 200,
    className: "h-auto rounded-md bg-raised px-5 py-2.5 font-mono text-lg",
  },
};
