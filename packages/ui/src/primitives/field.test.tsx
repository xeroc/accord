import type * as React from "react";

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  useField,
} from "./field";
import { Input } from "./input";

/** The canonical app composition: label + control + description + error. */
function TestField({ invalid = false }: { invalid?: boolean }): React.ReactElement {
  return (
    <Field invalid={invalid}>
      <FieldLabel>Evidence URI</FieldLabel>
      <FieldControl>
        <Input placeholder="ar://…" />
      </FieldControl>
      <FieldDescription>Paste a permanent URI.</FieldDescription>
      <FieldError>Not a valid URI</FieldError>
    </Field>
  );
}

describe("Field", () => {
  it("associates the label with the control via a generated id", async () => {
    const user = userEvent.setup();
    render(<TestField />);

    await user.click(screen.getByText("Evidence URI"));
    expect(screen.getByRole("textbox", { name: "Evidence URI" })).toHaveFocus();
  });

  it("announces description and error through aria-describedby", () => {
    render(<TestField />);

    const describedBy = screen.getByRole("textbox").getAttribute("aria-describedby") ?? "";
    const desc = screen.getByText("Paste a permanent URI.");
    const err = screen.getByText("Not a valid URI");
    expect(describedBy).toContain(desc.id);
    expect(describedBy).toContain(err.id);
  });

  it("marks the control aria-invalid only when the field is invalid", () => {
    const { rerender } = render(<TestField />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");

    rerender(<TestField invalid />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("FieldControl preserves the control's own props", () => {
    render(
      <Field>
        <FieldControl>
          <Input placeholder="kept" />
        </FieldControl>
      </Field>,
    );
    expect(screen.getByPlaceholderText("kept")).toBeInTheDocument();
  });

  it("FieldError renders nothing without children or errors", () => {
    render(<FieldError />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("FieldError renders an alert with children", () => {
    render(<FieldError>Boom</FieldError>);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("FieldLabel outside a Field renders without an htmlFor", () => {
    render(<FieldLabel>Bare label</FieldLabel>);
    expect(screen.getByText("Bare label")).not.toHaveAttribute("for");
  });

  it("useField inside a Field exposes the same ids FieldControl applies", () => {
    function Probe(): React.ReactElement {
      const field = useField();
      return <span data-testid="probe">{field.id}</span>;
    }
    const { container } = render(
      <Field>
        <FieldControl>
          <Input />
        </FieldControl>
        <Probe />
      </Field>,
    );
    const input = container.querySelector("input")!;
    const probe = screen.getByTestId("probe");
    expect(input.id).toBe(probe.textContent);
    expect(input.id).toMatch(/^[a-zA-Z0-9-]+$/);
  });
});
