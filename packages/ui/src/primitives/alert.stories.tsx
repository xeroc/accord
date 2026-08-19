import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlertIcon, InfoIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "destructive"] },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert>
      <InfoIcon />
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>
        Evidence submission closes when the second juror enters deliberation.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Verdict rejected</AlertTitle>
      <AlertDescription>
        The court rejected the verdict: the evidence hash does not match the
        submitted bundle.
      </AlertDescription>
    </Alert>
  ),
};

/** With an action docked top-right (AlertAction is absolutely positioned). */
export const WithAction: Story = {
  render: () => (
    <Alert>
      <InfoIcon />
      <AlertTitle>New evidence added</AlertTitle>
      <AlertDescription>
        A second file was attached to dispute #1042.
      </AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm">
          Review
        </Button>
      </AlertAction>
    </Alert>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex w-full max-w-md flex-col gap-4">
      <Alert>
        <InfoIcon />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>Neutral informational alert.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Destructive</AlertTitle>
        <AlertDescription>Something went irreversibly wrong.</AlertDescription>
      </Alert>
    </div>
  ),
};
