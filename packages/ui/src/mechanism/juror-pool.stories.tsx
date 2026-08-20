import type { Meta, StoryObj } from "@storybook/react-vite";

import { JurorPool } from "./juror-pool";

const meta = {
  title: "Mechanism/JurorPool",
  component: JurorPool,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 360, step: 1 } },
    count: { control: { type: "number", min: 1, max: 60 } },
    cols: { control: { type: "number", min: 1, max: 20 } },
    fadeAt: { control: { type: "number", min: 0 } },
  },
  args: {
    frame: 0,
    count: 30,
    cols: 15,
    drawnAt: () => undefined,
  },
} satisfies Meta<typeof JurorPool>;

export default meta;
type Story = StoryObj<typeof JurorPool>;

/** The staked pool at rest — hairline grey dots, nothing drawn. */
export const Idle: Story = {};

/** How many dots light — keep this the source of truth for both states.
 *  (When composing with SealedVote, derive the dots from the juror cast
 *  instead — see Patterns/Mechanism playground.) */
const JUROR_COUNT = 5;
const DRAWN_DOTS = Array.from({ length: JUROR_COUNT }, (_, i) => 3 + i * 6);
const drawnAt = (d: number) => {
  const j = DRAWN_DOTS.indexOf(d);
  return j >= 0 ? 24 + j * 6 : undefined;
};

/** Five jurors drawn — dots flash Verdict Amber and settle lit. */
export const Drawn: Story = {
  args: { frame: 60, drawnAt, label: "STAKED POOL · 30" },
};

/** Jury seated — the whole pool retires so the story can move on. */
export const Retired: Story = {
  args: { frame: 96, drawnAt, fadeAt: 78 },
};
