import { describe, expect, it } from "vitest";
import type { ReraSnapshot } from "@/lib/rera/snapshot";
import { reraFactLines } from "./rera-facts";

const facts = (overrides: Partial<ReraSnapshot> = {}): ReraSnapshot => ({
  version: 1,
  source: "gujrera",
  layoutLandAreaSqm: 31734.7,
  openAreaSqm: 18261.63,
  coveredAreaSqm: 13473.07,
  coveredParkingAreaSqm: null,
  filing: {
    quarter: "Q-9",
    periodEndsOn: "2026-06-30",
    source: "quarterly_filing",
    progressPercent: 26.3,
    blocks: [
      {
        name: "A+B+C+D+E",
        progressPercent: 29.245,
        floors: 31,
        lifts: 25,
        slabs: 34,
      },
    ],
  },
  inventory: {
    totalUnits: 580,
    bookedUnits: 104,
    availableUnits: 476,
    asOn: "2026-07-07",
  },
  filings: { listed: 11, submitted: 10 },
  planPassingAuthority: "Ahmedabad Municipal Corporation",
  registeredOn: "2024-01-05",
  architects: [{ name: "APURVA AMIN", projectsCompleted: 25 }],
  engineers: [{ name: "AMITKUMAR BHIKHUBHAI RAMI", projectsCompleted: null }],
  contractors: [],
  boundary: [],
  centre: null,
  carpetGroups: [],
  ...overrides,
});

describe("reraFactLines", () => {
  it("states each fact with its own date, as Anamika's RERA page prints them", () => {
    const lines = Object.fromEntries(
      reraFactLines(facts()).map((line) => [line.label, line.value]),
    );

    expect(lines["Open area"]).toBe("196,567 sq ft, 57.5% of the site");
    expect(lines["Covered area"]).toBe("145,023 sq ft");
    expect(lines["Units available"]).toBe("476 of 580, as on 7 Jul 2026");
    expect(lines["Latest quarterly filing"]).toBe(
      "Q-9, period ending 30 Jun 2026",
    );
    expect(lines["Block A+B+C+D+E"]).toBe(
      "29.2% complete, 31 floors, 25 lifts",
    );
    expect(lines["Plans passed by"]).toBe("Ahmedabad Municipal Corporation");
    expect(lines["Registered with RERA on"]).toBe("5 Jan 2024");
    expect(lines["Regulator filings submitted"]).toBe("10 of 11");
    expect(lines["Architect"]).toBe("APURVA AMIN (25 projects)");
    // A count the regulator did not state is not printed as zero.
    expect(lines["Structural engineer"]).toBe("AMITKUMAR BHIKHUBHAI RAMI");
  });

  it("has no line for what the regulator does not state", () => {
    const lines = reraFactLines(
      facts({
        openAreaSqm: null,
        coveredAreaSqm: null,
        inventory: null,
        filings: null,
        planPassingAuthority: null,
        registeredOn: null,
        architects: [],
        engineers: [],
        filing: {
          quarter: null,
          periodEndsOn: null,
          source: null,
          progressPercent: null,
          blocks: [],
        },
      }),
    );

    expect(lines).toEqual([]);
  });

  it("gives an open area without a share when the site's size is not stated", () => {
    const lines = reraFactLines(
      facts({ coveredAreaSqm: null, layoutLandAreaSqm: null }),
    );

    expect(lines.find((line) => line.label === "Open area")?.value).toBe(
      "196,567 sq ft",
    );
  });
});
