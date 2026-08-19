import type { Meta, StoryObj } from "@storybook/react-vite";

import { Skeleton } from "./skeleton";
import { Card, CardContent, CardHeader } from "./card";

const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof Skeleton>;

/** Single line of text: h-4, content width. */
export const TextLine: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  ),
};

/** Card-shaped loading state mirroring the dispute card layout. */
export const CardSkeleton: Story = {
  render: () => (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-1/3" />
      </CardContent>
    </Card>
  ),
};

/** List-shaped loading state for dispute/verdict lists. */
export const ListSkeleton: Story = {
  render: () => (
    <ul className="flex w-full max-w-sm flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  ),
};
