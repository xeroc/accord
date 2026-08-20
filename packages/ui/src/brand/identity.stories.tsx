import type { Meta, StoryObj } from "@storybook/react-vite";

import { AccordMark } from "./accord-mark";
import { AmberRule } from "./amber-rule";
import { Wordmark } from "./wordmark";
import { useWallClockFrame } from "../mechanism/clock";

const meta = {
  title: "Brand/Identity",
  parameters: {
    docs: {
      description: {
        component:
          "The Accord house identity: the 3-line AccordMark (one geometry everywhere — never redraw it) and the wordmark lockup. Static by default; progress props (0→1) drive the video draw-on treatments. The ambient Backdrop lives in Mechanism (frame-contract vocabulary).",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** The mark as shipped in navbars and footers — static, currentColor. */
export const MarkStatic: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <AccordMark size={64} />
      <AccordMark size={32} />
      <AccordMark size={20} />
      <AccordMark size={20} className="text-nearwhite" />
    </div>
  ),
};

/** Draw-on via progress — the video reveal treatment. */
function MarkDrawDemo() {
  const frame = useWallClockFrame({ fps: 30, loopFrames: 120 });
  return <AccordMark size={96} progress={Math.min(frame / 36, 1)} />;
}
export const MarkDraw: Story = { render: () => <MarkDrawDemo /> };

/** Wordmark + rule lockup, static. */
export const Lockup: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-6">
      <Wordmark className="text-6xl" />
      <AmberRule />
    </div>
  ),
};
