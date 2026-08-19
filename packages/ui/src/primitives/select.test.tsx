import type * as React from "react";

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./select";

function TestSelect(): React.ReactElement {
  return (
    <Select>
      <SelectTrigger aria-label="Framework">
        <SelectValue placeholder="Pick a framework" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Frameworks</SelectLabel>
          <SelectItem value="react">React</SelectItem>
          <SelectItem value="solid">Solid</SelectItem>
          <SelectItem value="svelte">Svelte</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("shows the placeholder until a value is chosen", () => {
    render(<TestSelect />);
    expect(screen.getByRole("combobox")).toHaveTextContent(
      "Pick a framework",
    );
  });

  it("opens with ArrowDown, navigates with arrows, selects with Enter", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);
    const trigger = screen.getByRole("combobox");

    // Keyboard-open: ArrowDown opens the list and highlights the first item.
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeVisible();
    // Radix marks keyboard focus with data-highlighted; aria-selected only
    // reflects a committed value (none yet).
    expect(screen.getByRole("option", { name: "React" })).toHaveAttribute(
      "data-highlighted",
    );

    // ArrowDown moves highlight to Solid.
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Solid" })).toHaveAttribute(
      "data-highlighted",
    );

    // Enter commits the highlighted item and closes the list.
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("Solid");
  });

  it("closes on Escape without changing the value", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);
    const trigger = screen.getByRole("combobox");

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("Pick a framework");
  });

  it("supports typeahead character search", async () => {
    const user = userEvent.setup();
    render(<TestSelect />);
    const trigger = screen.getByRole("combobox");

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("sv"); // typeahead jumps past React/Solid to Svelte
    await user.keyboard("{Enter}");

    expect(trigger).toHaveTextContent("Svelte");
  });

  it("renders as a disabled trigger", () => {
    render(
      <Select disabled>
        <SelectTrigger aria-label="Framework">
          <SelectValue placeholder="Pick a framework" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="react">React</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
