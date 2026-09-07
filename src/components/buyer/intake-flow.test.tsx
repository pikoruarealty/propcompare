import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_FILTER_OPTIONS,
  type FilterOptions,
} from "@/lib/properties/filter-options";
import {
  MAX_PRIORITIES,
  PRIORITY_OPTIONS,
  QUESTION_STEP_COUNT,
} from "@/lib/properties/intake";
import { IntakeFlow } from "./intake-flow";

/**
 * The guided intake flow: step navigation, answer retention across Back and
 * Next, skippability, and the guard that the stated range never leaves the
 * device.
 *
 * This is the first screen in the phase with real interaction, so it is driven
 * with `user-event` rather than asserted on a single render.
 */

const options: FilterOptions = {
  cities: ["Ahmedabad", "Surat"],
  localities: ["Bodakdev"],
  propertyTypes: [{ key: "apartment", label: "Apartment" }],
  bhkTypes: [
    { key: "2bhk", label: "2 BHK" },
    { key: "3bhk", label: "3 BHK" },
  ],
  amenities: [{ key: "clubhouse", label: "Clubhouse" }],
};

const next = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /Next|See your brief/ }));

const back = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Back" }));

/** Drives the flow from the first question to the summary. */
const advanceToSummary = async (user: ReturnType<typeof userEvent.setup>) => {
  await next(user); // priorities -> configuration
  await next(user); // configuration -> city
  await next(user); // city -> range
  await next(user); // range -> summary
};

const renderFlow = (filterOptions: FilterOptions = options) => {
  const user = userEvent.setup();
  render(<IntakeFlow options={filterOptions} />);
  return user;
};

/** A priority checkbox, whose accessible name carries its grounding line too. */
const priorityBox = (label: string): HTMLElement =>
  screen.getByRole("checkbox", { name: new RegExp(label) });

const briefValue = (label: string): string => {
  const row = screen
    .getByText(label)
    .closest('[data-slot="brief-row"]') as HTMLElement;
  return row.querySelector("dd")?.textContent ?? "";
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IntakeFlow — navigation", () => {
  it("opens on the first question with nowhere to go back to", () => {
    renderFlow();

    expect(screen.getByText(`Step 1 of ${QUESTION_STEP_COUNT}`)).toBeVisible();
    expect(screen.getByText("What matters most to you?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("walks the four questions in order and lands on the brief", async () => {
    const user = renderFlow();

    expect(screen.getByText("Step 1 of 4")).toBeVisible();
    await next(user);
    expect(screen.getByText("Step 2 of 4")).toBeVisible();
    expect(
      screen.getByText("What configuration are you looking for?"),
    ).toBeVisible();

    await next(user);
    expect(screen.getByText("Where are you looking?")).toBeVisible();

    await next(user);
    expect(screen.getByText("The range you are working with")).toBeVisible();
    // The last question announces where it leads rather than saying "Next"
    // into an unexplained screen.
    expect(
      screen.getByRole("button", { name: /See your brief/ }),
    ).toBeVisible();

    await next(user);
    expect(screen.getByRole("heading", { name: "Your brief" })).toBeVisible();
    expect(screen.queryByText(/Step \d of 4/)).not.toBeInTheDocument();
  });

  it("offers an exit to the whole catalog on every step", async () => {
    const user = renderFlow();

    for (let step = 0; step < 4; step += 1) {
      // "Intake is optional" in the buyer flow means leaving is possible at any
      // point, not only before the first question.
      expect(
        screen.getByRole("link", { name: "Skip this and browse everything" }),
      ).toHaveAttribute("href", "/properties");
      await next(user);
    }
  });
});

describe("IntakeFlow — answer retention", () => {
  it("keeps every answer across Back and Next", async () => {
    const user = renderFlow();

    await user.click(priorityBox("Room for a family"));
    await next(user);
    await user.click(screen.getByRole("radio", { name: "3 BHK" }));
    await next(user);
    await user.click(screen.getByRole("radio", { name: "Surat" }));

    await back(user);
    expect(screen.getByRole("radio", { name: "3 BHK" })).toBeChecked();
    await back(user);
    expect(priorityBox("Room for a family")).toBeChecked();

    await next(user);
    await next(user);
    expect(screen.getByRole("radio", { name: "Surat" })).toBeChecked();
  });

  it("restates every answer on the brief", async () => {
    const user = renderFlow();

    await user.click(priorityBox("Room for a family"));
    await user.click(priorityBox("Moving in sooner"));
    await next(user);
    await user.click(screen.getByRole("radio", { name: "3 BHK" }));
    await next(user);
    await user.click(screen.getByRole("radio", { name: "Ahmedabad" }));
    await next(user);
    await user.click(screen.getByRole("button", { name: "State a range" }));
    fireEvent.change(
      screen.getByLabelText("Upper end of the range you are working with"),
      { target: { value: "200" } },
    );
    await next(user);

    expect(briefValue("Priorities")).toBe(
      "Room for a family, Moving in sooner",
    );
    expect(briefValue("Configuration")).toBe("3 BHK");
    expect(briefValue("City")).toBe("Ahmedabad");
    expect(briefValue("The range you stated")).toBe("₹50 lakh to ₹2 crore");
  });

  it("records an unanswered question as not stated rather than guessing", async () => {
    const user = renderFlow();
    await advanceToSummary(user);

    for (const label of [
      "Priorities",
      "Configuration",
      "City",
      "The range you stated",
    ]) {
      expect(briefValue(label)).toBe("Not stated");
    }
    expect(screen.getByText(/You have not stated anything yet/)).toBeVisible();
  });

  it("lets an answered question go back to unanswered", async () => {
    const user = renderFlow();
    await next(user);

    await user.click(screen.getByRole("radio", { name: "3 BHK" }));
    await user.click(screen.getByRole("radio", { name: "No preference" }));

    await next(user);
    await next(user);
    await next(user);
    expect(briefValue("Configuration")).toBe("Not stated");
  });

  it("caps the priorities and says so instead of dropping an earlier choice", async () => {
    const user = renderFlow();

    for (const option of PRIORITY_OPTIONS.slice(0, MAX_PRIORITIES)) {
      await user.click(priorityBox(option.label));
    }

    expect(priorityBox(PRIORITY_OPTIONS[MAX_PRIORITIES].label)).toBeDisabled();
    expect(screen.getByText(/Clear one to choose another/)).toBeVisible();
    expect(priorityBox(PRIORITY_OPTIONS[0].label)).toBeChecked();
  });

  it("starting again clears the answers and returns to the first question", async () => {
    const user = renderFlow();

    await user.click(priorityBox(PRIORITY_OPTIONS[0].label));
    await advanceToSummary(user);
    expect(briefValue("Priorities")).toBe(PRIORITY_OPTIONS[0].label);

    await user.click(screen.getByRole("button", { name: "Start again" }));

    expect(screen.getByText("Step 1 of 4")).toBeVisible();
    expect(priorityBox(PRIORITY_OPTIONS[0].label)).not.toBeChecked();
  });
});

describe("IntakeFlow — the stated range never leaves the device", () => {
  it("makes no network call at any point in the flow", async () => {
    // Throwing rather than recording silently: a call made during render would
    // otherwise be reported only at the end, long after the state that made it.
    const fetchSpy = vi.fn(() => {
      throw new Error("IntakeFlow must not make a network call");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const user = renderFlow();

    await user.click(priorityBox("Privacy and low density"));
    await next(user);
    await user.click(screen.getByRole("radio", { name: "2 BHK" }));
    await next(user);
    await user.click(screen.getByRole("radio", { name: "Ahmedabad" }));
    await next(user);
    await user.click(screen.getByRole("button", { name: "State a range" }));
    fireEvent.change(
      screen.getByLabelText("Lower end of the range you are working with"),
      { target: { value: "95" } },
    );
    await next(user);

    expect(screen.getByRole("heading", { name: "Your brief" })).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("carries only city and configuration into the hand-off link", async () => {
    const user = renderFlow();

    await next(user);
    await user.click(screen.getByRole("radio", { name: "3 BHK" }));
    await next(user);
    await user.click(screen.getByRole("radio", { name: "Ahmedabad" }));
    await next(user);
    await user.click(screen.getByRole("button", { name: "State a range" }));
    fireEvent.change(
      screen.getByLabelText("Upper end of the range you are working with"),
      { target: { value: "205" } },
    );
    await next(user);

    const href = screen
      .getByRole("link", { name: /See matching properties/ })
      .getAttribute("href");

    expect(href).toBe("/properties?city=Ahmedabad&bhk=3bhk");
    // The failure this guards is a monetary figure reaching browser history,
    // an access log, or the `Referer` header of the next request.
    expect(href).not.toContain("205");
    expect(href).not.toContain("50");
  });

  it("says plainly what the hand-off link does and does not carry", async () => {
    const user = renderFlow();
    await next(user);
    await user.click(screen.getByRole("radio", { name: "2 BHK" }));
    await next(user); // configuration -> city
    await next(user); // city -> range
    await next(user); // range -> summary

    // Matching is Phase 3. Without this sentence the result set reads as
    // "properties chosen for me", which is a claim the catalog cannot support.
    expect(
      screen.getByText(
        /filtered by configuration\. Your priorities and your stated range are not part of that link\./,
      ),
    ).toBeVisible();
  });

  it("opens the full catalog when nothing filterable was stated", async () => {
    const user = renderFlow();
    await advanceToSummary(user);

    expect(
      screen.getByRole("link", { name: /See matching properties/ }),
    ).toHaveAttribute("href", "/properties");
    expect(
      screen.getByText(/this opens the full catalog/i),
    ).toBeInTheDocument();
  });
});

describe("IntakeFlow — an empty catalog", () => {
  it("says there is nothing to choose from rather than offering nothing", async () => {
    const user = renderFlow(EMPTY_FILTER_OPTIONS);
    await next(user);

    expect(
      screen.getByText(/No configurations are published yet/),
    ).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    // The flow still runs: an empty catalog is not a broken flow.
    await next(user);
    expect(screen.getByText(/No cities are published yet/)).toBeVisible();
  });
});
