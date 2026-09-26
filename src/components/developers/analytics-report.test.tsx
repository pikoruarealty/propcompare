import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  Figure,
  PortfolioReport,
  PropertyReport,
  ReportMeta,
} from "@/lib/developers/analytics/report";
import { FIGURE_LABELS } from "@/lib/developers/analytics/metrics";
import { PortfolioView, PropertyView } from "./analytics-report";

const withheld: Figure = { released: false, value: null };
const shown = (value: number): Figure => ({ released: true, value });
const figures = Object.fromEntries(
  Object.keys(FIGURE_LABELS).map((key) => [key, withheld]),
) as PropertyReport["figures"];
const property = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "orchard-house",
  name: "Orchard House",
  locality: "Satellite",
  city: "Ahmedabad",
};
const meta: ReportMeta = {
  window: {
    key: "30d",
    label: "Last 30 days",
    start: "2026-08-27",
    end: "2026-09-25",
  },
  generatedAt: "2026-09-26T02:00:00Z",
  trackingSince: "2026-09-20T00:00:00Z",
  coverage: "partial",
  minVisitors: 5,
  rulesVersion: "release-v3",
  stale: true,
};

describe("developer analytics presentation", () => {
  it("explains the empty and not-yet-released states", () => {
    const report: PortfolioReport = {
      meta: null,
      portfolio: {
        visitors: withheld,
        visits: withheld,
        returningVisitors: withheld,
      },
      properties: [],
    };
    render(<PortfolioView report={report} window="30d" />);
    expect(screen.getByRole("status")).toHaveTextContent("first daily report");
    expect(screen.getByText(/No listed properties/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      "/api/v1/developer/export?window=30d",
    );
  });

  it("shows withheld figures without a number and explains stale partial coverage", () => {
    const report: PortfolioReport = {
      meta,
      portfolio: {
        visitors: withheld,
        visits: shown(8),
        returningVisitors: withheld,
      },
      properties: [
        { ...property, figures, completeness: { stated: 12, total: 20 } },
      ],
    };
    render(<PortfolioView report={report} window="30d" />);
    expect(
      screen.getByText(/period includes days before tracking began/),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("stale");
    expect(screen.getAllByText("Not enough data").length).toBeGreaterThan(1);
    expect(screen.getByText("12 of 20 facts stated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orchard House" })).toHaveAttribute(
      "href",
      `/developers/properties/${property.id}`,
    );
  });

  it("renders only released demand, pairing and peer figures with their meaning", () => {
    const report: PropertyReport = {
      meta: { ...meta, stale: false, coverage: "full" },
      property,
      figures: { ...figures, visitors: shown(12), views: shown(19) },
      splits: [
        {
          figure: "visitors",
          dimension: "intake_bhk",
          cells: [{ key: "2bhk", figure: shown(6) }],
        },
        {
          figure: "visitors",
          dimension: "intake_city",
          cells: [{ key: "Surat", figure: withheld }],
        },
      ],
      rivals: [
        {
          property: {
            ...property,
            id: "22222222-2222-4222-8222-222222222222",
            name: "River House",
          },
          developerName: "Other Developer",
          own: false,
          visitors: 7,
        },
      ],
      benchmarks: [
        {
          figure: "visitors",
          cohort: "city",
          cohortProperties: 6,
          cohortDevelopers: 3,
          median: 8,
        },
      ],
      completeness: { stated: 12, total: 20 },
    };
    const { container } = render(<PropertyView report={report} window="30d" />);
    expect(
      screen.getByRole("navigation", { name: "Report period" }),
    ).toBeInTheDocument();
    expect(screen.getByText("River House")).toBeInTheDocument();
    expect(screen.getByText("2 BHK")).toBeInTheDocument();
    const cityRow = screen.getByText("Surat").closest("tr")!;
    expect(within(cityRow).getByText("Not enough data")).toBeInTheDocument();
    expect(
      screen.getByText(/6 properties from 3 developers/),
    ).toBeInTheDocument();
    expect(screen.getByText(/median per visitor/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /visitor_id|session_id|private\.budget|buyer phone|price per/i,
    );
    expect(
      screen.getByRole("link", { name: /Download this property/ }),
    ).toHaveAttribute(
      "href",
      `/api/v1/developer/export?window=30d&property=${property.id}`,
    );
  });
});
