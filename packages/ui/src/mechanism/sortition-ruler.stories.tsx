import type { Meta, StoryObj } from "@storybook/react-vite";

import { SortitionRuler } from "./sortition-ruler";

/** C1's cast — the five Juror slices of the 1000-stake ruler. */
const STAKES = [120, 80, 450, 250, 100];
const LABELS = ["P", "Q", "R", "S", "T"];

const meta = {
  title: "Mechanism/SortitionRuler",
  component: SortitionRuler,
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    at: { control: { type: "number", min: 0 } },
    dartAt: { control: { type: "number", min: 0 } },
    drawnAt: { control: { type: "number", min: 0 } },
  },
  args: { frame: 90, at: 0, stakes: STAKES, labels: LABELS },
} satisfies Meta<typeof SortitionRuler>;

export default meta;
type Story = StoryObj<typeof SortitionRuler>;

/** Assembled — width is probability mass; R is simply a bigger target. */
export const Assembled: Story = {};

/** The throw — dart landed at r=290 (inside R), R tint-swept. */
export const Landed: Story = {
  args: {
    frame: 90,
    dartR: 290,
    dartAt: 70,
    throwFrom: 0,
    winner: 2,
    winAt: 74,
  },
};

/** Two seats drawn — R and S hatched out; the ruler never reshaped. */
export const Excluded: Story = {
  args: {
    frame: 150,
    dartR: 402,
    dartAt: 130,
    throwFrom: 0,
    winner: 3,
    winAt: 134,
    drawn: [2, 3],
    drawnAt: 110,
  },
};

/** The density wave crossing — probability made physical. */
export const DensityWave: Story = {
  args: { frame: 30, sweepAt: 20 },
};
