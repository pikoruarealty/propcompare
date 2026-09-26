import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BreakdownTable,
  CountTable,
  DailyTrend,
  duration,
  Funnel,
  percent,
  StatTiles,
} from "./panels";

describe("the analytics panels", () => {
  it("shows each funnel step with the share kept from the step before, and a hover title", () => {
    render(
      <Funnel
        steps={[
          { key: "visited", label: "Visited", visitors: 200 },
          { key: "viewed", label: "Viewed a property", visitors: 100 },
          { key: "opened", label: "Opened a comparison", visitors: 25 },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("100 · 50%");
    expect(items[2]).toHaveTextContent("25 · 25%");
    expect(items[2]).toHaveAttribute(
      "title",
      expect.stringContaining("13% of all, 25% of the step before"),
    );
  });

  it("draws a day per bar, each with its numbers on hover and in the table", () => {
    const { container } = render(
      <DailyTrend
        days={[
          { day: "2026-09-24", visitors: 10, comparisons: 3, enquiries: 1 },
          { day: "2026-09-25", visitors: 4, comparisons: 0, enquiries: 0 },
        ]}
      />,
    );
    const titles = [...container.querySelectorAll("title")].map(
      (t) => t.textContent,
    );
    expect(titles).toEqual([
      "2026-09-24: 10 visitors, 3 comparisons, 1 enquiries",
      "2026-09-25: 4 visitors, 0 comparisons, 0 enquiries",
    ]);
    expect(
      screen.getByRole("img", { name: "Visitors per day" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("draws one active day as one bar of fixed width, with the scale, not a full-width block", () => {
    const { container } = render(
      <DailyTrend
        days={[
          { day: "2026-09-26", visitors: 1, comparisons: 3, enquiries: 1 },
        ]}
      />,
    );
    const bar = container.querySelector("rect.fill-primary");
    expect(Number(bar?.getAttribute("width"))).toBeLessThanOrEqual(28);
    expect(container).toHaveTextContent("1 visitor");
  });

  it("keeps a bar narrow among many days and draws a slot for a quiet day", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-09-${String(i + 1).padStart(2, "0")}`,
      visitors: i === 25 ? 6 : 0,
      comparisons: 0,
      enquiries: 0,
    }));
    const { container } = render(<DailyTrend days={days} />);
    expect(container.querySelectorAll("title")).toHaveLength(30);
    expect(container.querySelectorAll("rect.fill-primary")).toHaveLength(30);
    expect(container).toHaveTextContent("6 visitors");
  });

  it("makes a tile that has somewhere to go a link, and leaves the rest as figures", () => {
    render(
      <StatTiles
        tiles={[
          {
            label: "Visitors",
            value: "12",
            link: {
              href: "/admin/analytics/visitors?days=30",
              label: "See the visitors",
            },
          },
          { label: "Time comparing", value: "14s" },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "See the visitors" }),
    ).toHaveAttribute("href", "/admin/analytics/visitors?days=30");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("links a funnel step to who reached it and who stopped there", () => {
    render(
      <Funnel
        days={30}
        steps={[
          { key: "visited", label: "Visited", visitors: 10 },
          { key: "viewed", label: "Viewed a property", visitors: 4 },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "6 stopped here" }),
    ).toHaveAttribute(
      "href",
      "/admin/analytics/visitors?days=30&stopped=visited",
    );
    expect(screen.getByRole("link", { name: /^4/ })).toHaveAttribute(
      "href",
      "/admin/analytics/visitors?days=30&reached=viewed",
    );
  });

  it("says so when there is nothing yet", () => {
    render(<DailyTrend days={[]} />);
    expect(
      screen.getByText("No visits in this period yet."),
    ).toBeInTheDocument();
    render(
      <CountTable rows={[]} what="Section" empty="No section opened yet." />,
    );
    expect(screen.getByText("No section opened yet.")).toBeInTheDocument();
  });

  it("gives shares of a count list and conversion within a breakdown", () => {
    render(
      <CountTable
        rows={[
          { label: "Room by room", count: 3 },
          { label: "Amenities", count: 1 },
        ]}
        what="Section"
        empty=""
      />,
    );
    expect(screen.getByRole("row", { name: /Room by room/ })).toHaveTextContent(
      "75%",
    );
    render(
      <BreakdownTable
        rows={[
          { label: "google / cpc", visitors: 10, comparers: 4, enquirers: 1 },
        ]}
        what="Source"
        empty=""
      />,
    );
    const row = screen.getByRole("row", { name: /google/ });
    expect(within(row).getByText(/40%/)).toBeInTheDocument();
    expect(within(row).getByText(/10%/)).toBeInTheDocument();
  });

  it("formats durations and shares", () => {
    expect(duration(null)).toBe("–");
    expect(duration(45)).toBe("45s");
    expect(duration(125)).toBe("2m 05s");
    expect(percent(1, 0)).toBe("–");
    expect(percent(1, 3)).toBe("33%");
  });
});
