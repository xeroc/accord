import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input } from "./input";
import { Separator } from "./separator";

const meta = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    size: { control: "radio", options: ["default", "sm"] },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof Card>;

/** Full composition: header (title/description/action), content, footer. */
export const Composition: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Dispute #1042</CardTitle>
          <CardDescription>
            Juror deadline expires in 2 days, 4 hours.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">Evidence</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Both parties have submitted their evidence bundles. Deliberation
          begins once the second juror stakes.
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" size="sm">
            View evidence
          </Button>
          <Button size="sm">Enter deliberation</Button>
        </CardFooter>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Compact card</CardTitle>
          <CardDescription>size=&quot;sm&quot; — tighter spacing.</CardDescription>
        </CardHeader>
        <CardContent>For dense lists and side panels.</CardContent>
      </Card>
    </div>
  ),
};

/** Card as a form surface: input, separator, and footer actions. */
export const FormCard: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Stake as juror</CardTitle>
        <CardDescription>
          Lock 500 USDC to join the jury pool for this dispute.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Amount (USDC)" aria-label="Stake amount" />
        <Separator />
        <p className="text-xs text-muted-foreground">
          Funds return automatically when the verdict finalizes.
        </p>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button size="sm">Stake</Button>
      </CardFooter>
    </Card>
  ),
};
