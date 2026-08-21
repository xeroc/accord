import type { Meta, StoryObj } from "@storybook/react-vite";

import { SortitionRuler } from "./sortition-ruler";

/** C1's cast — the five juror slices of the 1000-stake ruler. */
const STAKES = [120, 80, 450, 250, 100];
const LABELS = ["P", "Q", "R", "S", "T"];

/** The full C1 choreography — the collision → re-derivation story. */
const FULL_DRAW = {
  stakes: STAKES,
  labels: LABELS,
  at: 4,
  sweepAt: 56,
  darts: [
    // dart 1: pinned at r=0, thrown, lands inside R (the first winner)
    { r: 290, from: 0, pinAt: 70, throwAt: 92, landAt: 104 },
    // dart 2: the collision — lands inside drawn R, dissolves
    { r: 538, from: 0, throwAt: 158, landAt: 168, dissolveAt: 178 },
    // dart 3: the re-derived r₁ — lands inside S
    { r: 773, from: 0, throwAt: 200, landAt: 212 },
  ],
  wins: [
    { seg: 2, at: 108 },
    { seg: 3, at: 216 },
  ],
  hatches: [
    { seg: 2, at: 142 },
    { seg: 3, at: 250 },
  ],
};

const meta = {
  title: "Mechanism/SortitionRuler",
  component: SortitionRuler,
  parameters: { layout: "centered" },
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 280, step: 1 } },
  },
  args: { frame: 260, ...FULL_DRAW },
} satisfies Meta<typeof SortitionRuler>;

export default meta;
type Story = StoryObj<typeof SortitionRuler>;

/** The whole draw, settled — two seats drawn, R and S excluded. */
export const FullDraw: Story = {};

/** The throw — dart 1 mid-flight, R about to tint. */
export const TheThrow: Story = {
  args: { frame: 98 },
};

/** The collision — dart 2 landed inside drawn R, about to dissolve. */
export const Collision: Story = {
  args: { frame: 172 },
};

/** The re-derivation — r₁ in flight to S. */
export const ReDerived: Story = {
  args: { frame: 206 },
};

/** Just the ruler — width is probability mass, no draw yet. */
export const Assembled: Story = {
  args: { frame: 60, stakes: STAKES, labels: LABELS, at: 4, sweepAt: 56 },
};
