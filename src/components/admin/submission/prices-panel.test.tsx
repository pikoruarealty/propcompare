import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PricesState } from "@/lib/pricing/panel";
import { PricesPanel } from "./prices-panel";

/**
 * The Prices tab, against a stand-in for its route (`prices-panel.tsx`,
 * `DECISIONS.md` 2026-09-24, "price data").
 */

const ID = "11111111-1111-4111-8111-111111111111";

const base: PricesState = {
  submissionStatus: "draft",
  editable: true,
  unitTypes: [
    { name: "Type A", staged: null, stagedApplied: false, current: null },
    { name: "Type B", staged: null, stagedApplied: false, current: null },
  ],
  orphanedStaged: [],
  registrationNumber: "PR/GJ/X",
  rera: {
    minInr: "22573000",
    maxInr: "66319200",
    fetchedAt: "2026-09-24T00:00:00.000Z",
  },
  unavailable: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const stubRoute = (
  handler: (method: string, body: unknown, url: string) => Response,
) => {
  const calls: { method: string; body: unknown; url: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, body, url });
      return handler(method, body, url);
    }),
  );
  return calls;
};

afterEach(() => vi.unstubAllGlobals());

describe("PricesPanel", () => {
  it("says at the top that prices are private and never shown to buyers", async () => {
    stubRoute(() => json(base));
    render(<PricesPanel submissionId={ID} active />);

    expect(
      await screen.findByText(/never shown to buyers anywhere/i),
    ).toBeInTheDocument();
  });

  it("shows RERA's range as a reference and a row per unit type", async () => {
    stubRoute(() => json(base));
    const { container } = render(<PricesPanel submissionId={ID} active />);

    const rera = await waitFor(() => {
      const el = container.querySelector('[data-slot="prices-rera"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(rera).toHaveTextContent("₹2.26 crore to ₹6.63 crore");
    expect(rera).toHaveTextContent(/one range for the whole project/i);
    expect(screen.getByLabelText("Type A")).toBeInTheDocument();
    expect(screen.getByLabelText("Type B")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="prices-none"]'),
    ).toHaveTextContent(/RERA.s range alone/);
  });

  it("saves a typed price on leaving the field, grouped the Indian way, and says it is saved", async () => {
    const user = userEvent.setup();
    const calls = stubRoute((method) =>
      method === "PUT"
        ? json({
            ...base,
            unitTypes: [
              { ...base.unitTypes[0], staged: "25000000" },
              base.unitTypes[1],
            ],
          })
        : json(base),
    );
    const { container } = render(<PricesPanel submissionId={ID} active />);
    const input = await screen.findByLabelText("Type A");

    await user.type(input, "25000000");
    expect(input).toHaveValue("2,50,00,000");
    expect(screen.getByText("₹2.5 crore")).toBeInTheDocument();
    await user.tab();

    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-slot="price-row"] [data-slot="price-state"]',
        ),
      ).toHaveTextContent(
        /becomes the live price when this submission is published/,
      ),
    );
    const put = calls.find((call) => call.method === "PUT");
    expect(put?.body).toEqual({
      unitVariantName: "Type A",
      priceInr: "25000000",
    });
    expect(put?.url).toBe(`/api/v1/admin/submissions/${ID}/prices`);
  });

  it("ignores anything but digits, and shows the server's message when a price is refused", async () => {
    const user = userEvent.setup();
    stubRoute((method) =>
      method === "PUT"
        ? json(
            {
              error: {
                code: "invalid_request_body",
                message: "Enter the price in whole rupees.",
              },
            },
            422,
          )
        : json(base),
    );
    render(<PricesPanel submissionId={ID} active />);
    const input = await screen.findByLabelText("Type A");

    await user.type(input, "2a5.5");
    expect(input).toHaveValue("255");
    await user.tab();

    expect(
      await screen.findByText("Enter the price in whole rupees."),
    ).toBeInTheDocument();
  });

  it("removes a typed price", async () => {
    const user = userEvent.setup();
    const typed: PricesState = {
      ...base,
      unitTypes: [
        { ...base.unitTypes[0], staged: "25000000" },
        base.unitTypes[1],
      ],
    };
    const calls = stubRoute((method) =>
      json(method === "DELETE" ? base : typed),
    );
    render(<PricesPanel submissionId={ID} active />);
    const input = await screen.findByLabelText("Type A");
    expect(input).toHaveValue("2,50,00,000");

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(input).toHaveValue(""));
    expect(calls.find((c) => c.method === "DELETE")?.body).toEqual({
      unitVariantName: "Type A",
    });
  });

  it("lists the unit types with no price once another has one, and explains why it matters", async () => {
    stubRoute(() =>
      json({
        ...base,
        unitTypes: [
          { ...base.unitTypes[0], staged: "25000000" },
          base.unitTypes[1],
        ],
      }),
    );
    const { container } = render(<PricesPanel submissionId={ID} active />);

    const note = await waitFor(() => {
      const el = container.querySelector('[data-slot="prices-unpriced"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(note).toHaveTextContent("Not priced: Type B.");
    expect(note).toHaveTextContent(/will not match any buyer/i);
  });

  it("shows the live price of each unit type", async () => {
    stubRoute(() =>
      json({
        ...base,
        unitTypes: [{ ...base.unitTypes[0], current: "38000000" }],
      }),
    );
    const { container } = render(<PricesPanel submissionId={ID} active />);

    const row = await waitFor(() => {
      const el = container.querySelector('[data-slot="price-row"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(row).toHaveTextContent("Live now: ₹3.8 crore");
  });

  it("disables the fields once the submission is published, and offers to apply prices that did not arrive", async () => {
    const user = userEvent.setup();
    const calls = stubRoute((method, _body, url) =>
      url.endsWith("/apply")
        ? json({ applied: ["Type A"], unchanged: [], unknown: [] })
        : json({
            ...base,
            submissionStatus: "published",
            editable: false,
            unitTypes: [
              { ...base.unitTypes[0], staged: "25000000" },
              base.unitTypes[1],
            ],
          }),
    );
    render(<PricesPanel submissionId={ID} active />);

    expect(await screen.findByLabelText("Type A")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Apply now" }));

    expect(await screen.findByText("Applied.")).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/prices/apply"))).toBe(true);
  });

  it("says plainly when the private store is not configured", async () => {
    stubRoute(() => json({ ...base, unavailable: true, editable: false }));
    const { container } = render(<PricesPanel submissionId={ID} active />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="prices-unavailable"]'),
      ).not.toBeNull(),
    );
    expect(screen.queryByLabelText("Type A")).toBeNull();
  });

  it("does not load until its tab is showing, and asks again when it is shown", async () => {
    const calls = stubRoute(() => json(base));
    const { rerender } = render(
      <PricesPanel submissionId={ID} active={false} />,
    );
    expect(calls).toHaveLength(0);

    rerender(<PricesPanel submissionId={ID} active />);
    await screen.findByLabelText("Type A");
    expect(calls).toHaveLength(1);
    expect(within(document.body).queryByText(/could not be loaded/)).toBeNull();
  });

  it("offers to try again when the prices cannot be loaded", async () => {
    stubRoute(() => json({ error: { message: "no" } }, 500));
    render(<PricesPanel submissionId={ID} active />);

    expect(
      await screen.findByText(/prices could not be loaded/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
