import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";

const meta = {
  title: "Primitives/Dialog",
  component: Dialog,
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join dispute #1042</DialogTitle>
          <DialogDescription>
            You will stake 500 USDC for the duration of deliberation.
          </DialogDescription>
        </DialogHeader>
        <p>Your stake unlocks once the verdict finalizes.</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Stake &amp; join</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/** Long content scrolls inside the dialog; close button stays reachable. */
export const LongContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">View rules</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Jury pool rules</DialogTitle>
          <DialogDescription>
            The full ruleset for deliberation and slashing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 12 }, (_, i) => (
            <p key={i} className="text-muted-foreground">
              Rule {i + 1}: jurors must review every evidence bundle before
              voting. Failure to deliberate in good faith is slashable by the
              court.
            </p>
          ))}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  ),
};

/** Destructive confirmation: danger action on the right, escape hatch left. */
export const DestructiveConfirmation: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Slash verdict</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Slash this verdict?</DialogTitle>
          <DialogDescription>
            The juror&apos;s entire stake (500 USDC) will be forfeit. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep verdict</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive">Slash</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/** Form dialog — focus lands on the first field, Tab stays trapped inside. */
export const FormDialog: Story = {
  name: "Form dialog (focus + escape)",
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Submit evidence</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit evidence</DialogTitle>
          <DialogDescription>
            Paste a URI or CID. Focus starts inside; Escape closes and returns
            focus to the trigger.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Input autoFocus placeholder="ar://… or ipfs://…" aria-label="Evidence URI" />
          <Input placeholder="Display name (optional)" aria-label="Display name" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * The exported portal + overlay primitives on their own — for full-screen
 * scrims built without DialogContent (loading states, custom sheets).
 */
export const OverlayOnly: Story = {
  name: "Overlay only (portal + overlay)",
  render: () => (
    <Dialog defaultOpen>
      <DialogPortal>
        <DialogOverlay />
      </DialogPortal>
    </Dialog>
  ),
};
