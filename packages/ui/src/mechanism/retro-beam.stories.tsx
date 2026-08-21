import type { Meta, StoryObj } from "@storybook/react-vite";

import { RetroBeam } from "./retro-beam";

const ROUNDS = [
  { id: "R1", yes: 2, no: 1 },
  { id: "R2", yes: 2, no: 5 },
  { id: "R3", yes: 6, no: 9 },
];

const meta = {
  title: "Mechanism/RetroBeam",
  component: RetroBeam,
  parameters: { layout: "centered" },
  argTypes: {
    frame: { control: { type: "range", min: 0, max: 240, step: 1 } },
    beamFrom: { control: { type: "number", min: 0 } },
    beamTo: { control: { type: "number", min: 0 } },
  },
  args: {
    frame: 200,
    rounds: ROUNDS,
    finalRuling: "no",
    spotlight: { round: 0, side: "yes" },
  },
} satisfies Meta<typeof RetroBeam>;

export default meta;
type Story = StoryObj<typeof RetroBeam>;

/** Settled — beam cleared, stakes redistributed to the coherent jurors. */
export const Settled: Story = {};

/** Mid-sweep — the beam decelerating into R1, dots recoloring at its edge. */
export const MidSweep: Story = {
  args: { frame: 100 },
};

/** Redistribution — slashed jurors' stake arcing to the coherent ones. */
export const Redistribution: Story = {
  args: { frame: 118 },
};

/** Before the beam — round-local colors, the ruling stamped in its slot. */
export const BeforeSweep: Story = {
  args: { frame: 60 },
};

/** Beam only — recolors without the stake movement. */
export const NoRedistribution: Story = {
  args: { redistribute: false },
};
