import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_FILTER_OPTIONS,
  type FilterOptions,
} from "@/lib/properties/filter-options";
import {
  MAX_PRIORITIES,
  PRIORITY_OPTIONS,
  QUESTION_STEP_COUNT,
  RANGE_MAX_LAKH,
} from "@/lib/properties/intake";
import { propertyListFixture } from "@/lib/properties/fixtures";
import type { PropertyListResult } from "@/lib/properties/types";
import { setPendingIntakeClaim } from "@/lib/properties/pending-intake-claim";

const { useSession, push } = vi.hoisted(() => ({
  useSession: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ data: null, isPending: false });
});

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

describe("IntakeFlow — the stated range never leaves the device unasked", () => {
  it("makes no network call anywhere in the questions or the brief", async () => {
    // Tightened rather than dropped now that matching exists: answering the
    // questions and reading the brief must still reach no server. Only the
    // buyer's explicit "See your matches" may, and that is asserted below.
    //
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

  it("puts no monetary figure in any link, even once a range is stated", async () => {
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

    // With a range stated the ending is an action, not a link — the range goes
    // in a request body. The failure this guards is a monetary figure reaching
    // browser history, an access log, or the `Referer` header of the next
    // request, so no href anywhere on the brief may carry one.
    expect(
      screen.queryByRole("link", { name: /See matching properties/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /See your matches/ }),
    ).toBeVisible();

    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      expect(href).not.toContain("205");
      expect(href).not.toContain("50");
      expect(href).not.toMatch(/inr|lakh|crore|budget|price/i);
    }
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

describe("IntakeFlow — running a match", () => {
  /** Drives the flow to the brief with a range, a city, and a configuration. */
  const advanceWithRange = async (
    user: ReturnType<typeof userEvent.setup>,
    upperLakh = "150",
  ) => {
    await next(user); // priorities -> configuration
    await user.click(screen.getByRole("radio", { name: "2 BHK" }));
    await next(user); // configuration -> city
    await user.click(screen.getByRole("radio", { name: "Ahmedabad" }));
    await next(user); // city -> range
    await user.click(screen.getByRole("button", { name: "State a range" }));
    fireEvent.change(
      screen.getByLabelText("Upper end of the range you are working with"),
      { target: { value: upperLakh } },
    );
    await next(user); // range -> summary
  };

  const stubMatches = (result: PropertyListResult = propertyListFixture) => {
    // Typed rather than inferred, so `mock.calls` carries the url and the init
    // that `sentBody` and the assertions below read off it.
    const fetchSpy = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(async () => Response.json(result));
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  };

  const seeMatches = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: /See your matches/ }));

  const sentBody = (fetchSpy: ReturnType<typeof stubMatches>, call = 0) =>
    JSON.parse(fetchSpy.mock.calls[call][1].body as string);

  it("sends the stated range and the filterable answers, and nothing else", async () => {
    const fetchSpy = stubMatches();
    const user = renderFlow();
    await advanceWithRange(user);

    expect(fetchSpy).not.toHaveBeenCalled();
    await seeMatches(user);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/v1/discovery/matches");
    expect(init.method).toBe("POST");
    expect(sentBody(fetchSpy)).toEqual({
      minInr: 5_000_000,
      maxInr: 15_000_000,
      city: "Ahmedabad",
      bhk: "2bhk",
      page: 1,
      pageSize: 20,
    });
  });

  it("sends the open top end as unbounded, never as the figure the handle sits on", async () => {
    const fetchSpy = stubMatches();
    const user = renderFlow();
    await advanceWithRange(user, String(RANGE_MAX_LAKH));
    await seeMatches(user);

    const body = sentBody(fetchSpy);
    expect(body.maxUnbounded).toBe(true);
    expect(body).not.toHaveProperty("maxInr");
    // The buyer who declines to name a ceiling must not be given one.
    expect(await screen.findByText(/no upper limit/)).toBeVisible();
  });

  it("renders the matched properties beneath the brief, not instead of it", async () => {
    stubMatches();
    const user = renderFlow();
    await advanceWithRange(user);
    await seeMatches(user);

    expect(
      await screen.findByRole("heading", { name: "What matches your brief" }),
    ).toBeVisible();
    // The brief is what makes "go back and widen the range" actionable, so it
    // stays on screen beside its results.
    expect(screen.getByRole("heading", { name: "Your brief" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(
      propertyListFixture.data.length,
    );
  });

  it("discards a rendered result the moment an answer changes", async () => {
    stubMatches();
    const user = renderFlow();
    await advanceWithRange(user);
    await seeMatches(user);
    expect(
      await screen.findByRole("heading", { name: "What matches your brief" }),
    ).toBeVisible();

    await back(user); // summary -> range
    fireEvent.change(
      screen.getByLabelText("Upper end of the range you are working with"),
      { target: { value: "300" } },
    );
    await next(user); // range -> summary

    // A grid left standing beside an edited brief is a claim about a search
    // that was never run.
    expect(
      screen.queryByRole("heading", { name: "What matches your brief" }),
    ).not.toBeInTheDocument();
  });

  it("clears the results when the buyer starts again", async () => {
    stubMatches();
    const user = renderFlow();
    await advanceWithRange(user);
    await seeMatches(user);
    await screen.findByRole("heading", { name: "What matches your brief" });

    await user.click(screen.getByRole("button", { name: "Start again" }));

    expect(screen.getByText("Step 1 of 4")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "What matches your brief" }),
    ).not.toBeInTheDocument();
  });

  it("asks for the next page without putting it in a URL", async () => {
    const fetchSpy = stubMatches({
      data: propertyListFixture.data,
      pagination: { page: 1, pageSize: 2, total: 6, totalPages: 3 },
    });
    const user = renderFlow();
    await advanceWithRange(user);
    await seeMatches(user);

    await user.click(await screen.findByRole("button", { name: /Next/ }));

    expect(sentBody(fetchSpy, 1).page).toBe(2);
  });

  it("shows a failed search as a failure, never as an empty catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "invalid_request_body", message: "minInr …" } },
          { status: 422 },
        ),
      ),
    );
    const user = renderFlow();
    await advanceWithRange(user);
    await seeMatches(user);

    expect(await screen.findByText("That search did not run")).toBeVisible();
    expect(
      screen.queryByText(/Nothing published matches/),
    ).not.toBeInTheDocument();
    // The endpoint's message names contract fields, `minInr` among them.
    expect(document.body.textContent).not.toMatch(/minInr/);
  });

  it("keeps the flow alive when the network fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const user = renderFlow();
    await advanceWithRange(user);
    await seeMatches(user);

    expect(await screen.findByText(/could not be loaded/)).toBeVisible();
    // Every answer survives a failed request.
    expect(briefValue("City")).toBe("Ahmedabad");
    expect(briefValue("The range you stated")).toBe("₹50 lakh to ₹1.5 crore");
  });

  it("renders no match action, and sends nothing, without a stated range", async () => {
    const fetchSpy = stubMatches();
    const user = renderFlow();
    await advanceToSummary(user);

    // The endpoint requires both bounds; a default range invented here would be
    // a figure the buyer deliberately declined to state.
    expect(
      screen.queryByRole("button", { name: /See your matches/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: /See matching properties/ }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
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

describe("IntakeFlow — signing in to keep a pre-login search", () => {
  it("offers no such thing until the buyer has stated anything", async () => {
    const user = renderFlow();
    await advanceToSummary(user);
    expect(
      screen.queryByRole("button", { name: /Sign in to keep this search/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no such thing to a buyer who is already signed in", async () => {
    useSession.mockReturnValue({
      data: { user: { name: "Riya Shah" } },
      isPending: false,
    });
    const user = renderFlow();
    await user.click(priorityBox(PRIORITY_OPTIONS[0].label));
    await advanceToSummary(user);
    expect(
      screen.queryByRole("button", { name: /Sign in to keep this search/ }),
    ).not.toBeInTheDocument();
  });

  it("sets the handoff cookie with the current answers, then sends the buyer to sign in", async () => {
    const fetchSpy = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);

    const user = renderFlow();
    await next(user); // priorities -> configuration
    await user.click(screen.getByRole("radio", { name: "2 BHK" }));
    await next(user); // configuration -> city
    await next(user); // city -> range
    await next(user); // range -> summary

    await user.click(
      screen.getByRole("button", { name: /Sign in to keep this search/ }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/v1/buyer/intake-handoff");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      priorities: [],
      bhk: "2bhk",
      city: null,
      statedRange: null,
    });
    expect(push).toHaveBeenCalledWith("/login?next=%2Fintake");
  });

  it("still sends the buyer to sign in even when the cookie could not be set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    const user = renderFlow();
    await user.click(priorityBox(PRIORITY_OPTIONS[0].label));
    await advanceToSummary(user);

    await user.click(
      screen.getByRole("button", { name: /Sign in to keep this search/ }),
    );
    expect(push).toHaveBeenCalledWith("/login?next=%2Fintake");
  });
});

describe("IntakeFlow — reapplying a claimed pre-login search", () => {
  it("does nothing when there is no claim to consume", () => {
    renderFlow();
    expect(screen.getByText("Step 1 of 4")).toBeVisible();
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
  });

  it("jumps straight to the brief with the claimed answers, editable, and runs the match", async () => {
    setPendingIntakeClaim({
      priorities: ["family_space"],
      bhk: "2bhk",
      city: "Ahmedabad",
      statedRange: { fromLakh: 50, toLakh: 150 },
    });
    const fetchSpy = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(async () => Response.json(propertyListFixture));
    vi.stubGlobal("fetch", fetchSpy);

    render(<IntakeFlow options={options} />);

    expect(await screen.findByText(/Welcome back/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your brief" })).toBeVisible();
    expect(briefValue("Priorities")).toBe("Room for a family");
    expect(briefValue("City")).toBe("Ahmedabad");

    // Reapplied, not locked in: the answers are ordinary editable state.
    expect(
      await screen.findByRole("heading", { name: "What matches your brief" }),
    ).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body as string)).toEqual({
      minInr: 5_000_000,
      maxInr: 15_000_000,
      city: "Ahmedabad",
      bhk: "2bhk",
      page: 1,
      pageSize: 20,
    });
  });

  it("clears the welcome-back note the moment the buyer changes an answer", async () => {
    setPendingIntakeClaim({
      priorities: [],
      bhk: null,
      city: "Ahmedabad",
      statedRange: null,
    });
    const user = renderFlow();
    expect(await screen.findByText(/Welcome back/)).toBeVisible();

    // Summary -> range -> city, to reach the question this claim answered.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("radio", { name: "Surat" }));

    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
  });
});
