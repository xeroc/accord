import { render, screen } from "@testing-library/react";
import { DisputeState } from "@useaccord/sdk";
import { describe, expect, it } from "vitest";

import { DisputeList } from "../../../app/src/features/dispute/DisputeList";
import { AppHarness } from "./app-harness";
import { makeDispute } from "./fixtures";

describe("AppHarness", () => {
  it("renders the real apps/app DisputeList view from seeded fixture data", async () => {
    render(
      <AppHarness
        route="/disputes"
        seed={{
          disputes: [
            makeDispute({
              address: "DispUTe1111111111111111111111111111111111111",
              state: DisputeState.Created,
            }),
            makeDispute({
              address: "Rul1ng2222222222222222222222222222222222222",
              state: DisputeState.Final,
            }),
          ],
        }}
      >
        <DisputeList />
      </AppHarness>,
    );

    // Seeded cache → no loading state, no network: fixture rows render.
    expect(await screen.findByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByText("Address")).toBeInTheDocument();
  });
});
