import { describe, expect, it } from "vitest";
import {
  buildReraSnapshot,
  reraSnapshotProblem,
  snapshotFingerprint,
} from "./snapshot";
import type { RegulatorDetails, RegulatorRecord } from "./types";

const details: RegulatorDetails = {
  version: 1,
  layoutLandAreaSqm: 7628,
  openAreaSqm: 3131.1,
  coveredAreaSqm: 4496.9,
  coveredParkingAreaSqm: 12553.45,
  filing: {
    quarter: "Q-14",
    periodEndsOn: "2026-06-30",
    source: "quarterly_filing",
    progressPercent: 93.7,
    blocks: [
      {
        name: "A+B",
        progressPercent: 95.9,
        floors: 22,
        lifts: 8,
        slabs: 24,
      },
    ],
  },
  inventory: {
    totalUnits: 76,
    bookedUnits: 63,
    availableUnits: 13,
    asOn: "2026-07-03",
  },
  filings: { listed: 18, submitted: 17 },
  planPassingAuthority: "AUDA",
  registeredOn: "2022-11-11",
  architects: [{ name: "HM Architects", projectsCompleted: 62 }],
  engineers: [],
  contractors: [],
  boundary: [
    { lat: 23.0275, lng: 72.4888 },
    { lat: 23.0274, lng: 72.49 },
    { lat: 23.0269, lng: 72.49 },
  ],
  centre: { lat: 23.0272, lng: 72.4894 },
};

const record = {
  regulatorCode: "gujrera",
  carpetGroups: [
    {
      block: "A",
      carpetAreaSqm: 285,
      flatCount: 28,
      firstFlat: "A-204",
      lastFlat: "A-3004",
      bookedCount: 5,
    },
  ],
  details,
} as unknown as RegulatorRecord;

describe("buildReraSnapshot", () => {
  it("holds the details and the carpet groups, and names its regulator", () => {
    const snapshot = buildReraSnapshot(record);

    expect(snapshot).toMatchObject({
      version: 1,
      source: "gujrera",
      openAreaSqm: 3131.1,
      carpetGroups: [{ block: "A", bookedCount: 5 }],
    });
    expect(reraSnapshotProblem(snapshot)).toBeNull();
  });

  it("has no time of the fetch, so an unchanged check proposes nothing", () => {
    const snapshot = buildReraSnapshot(record)!;

    expect(JSON.stringify(snapshot)).not.toMatch(/fetchedAt/);
  });

  it("is null for a record fetched before these facts were read", () => {
    expect(
      buildReraSnapshot({ ...record, details: undefined } as RegulatorRecord),
    ).toBeNull();
  });
});

describe("reraSnapshotProblem", () => {
  // A copy each time: a test that adds to a list must not change the next one's.
  const good = () =>
    structuredClone(buildReraSnapshot(record)) as unknown as Record<
      string,
      unknown
    >;

  it("refuses what is not an object of the current version", () => {
    expect(reraSnapshotProblem("x")).toMatch(/object/);
    expect(reraSnapshotProblem({ ...good(), version: 2 })).toMatch(/version/);
    expect(reraSnapshotProblem({ ...good(), source: "" })).toMatch(/regulator/);
  });

  it("refuses a snapshot missing a list it must carry", () => {
    const { boundary: _boundary, ...rest } = good();
    expect(reraSnapshotProblem(rest)).toMatch(/boundary/);
  });

  it.each([
    ["projectCost", { projectCost: 1 }],
    ["unitPrice", { unitPrice: 1 }],
    ["mobileNo", { mobileNo: "x" }],
    ["contactEmail", { contactEmail: "x" }],
    ["accountNumber", { accountNumber: "x" }],
  ])("refuses a key named %s at the top", (key, extra) => {
    expect(reraSnapshotProblem({ ...good(), ...extra })).toMatch(
      new RegExp(key),
    );
  });

  it("finds a forbidden key however deep it sits", () => {
    const value = good();
    (value.architects as unknown[]).push({
      name: "X",
      contact: { phone: "1" },
    });
    expect(reraSnapshotProblem(value)).toMatch(/phone/);
  });

  it("refuses an oversized snapshot", () => {
    const value = good();
    value.boundary = Array.from({ length: 20000 }, () => ({
      lat: 23.123456789,
      lng: 72.123456789,
    }));
    expect(reraSnapshotProblem(value)).toMatch(/too large/);
  });
});

describe("snapshotFingerprint", () => {
  it("ignores key order and nothing else", () => {
    expect(snapshotFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(
      snapshotFingerprint({ b: { d: 3, c: 2 }, a: 1 }),
    );
    expect(snapshotFingerprint({ a: 1 })).not.toBe(
      snapshotFingerprint({ a: 2 }),
    );
    expect(snapshotFingerprint({ l: [1, 2] })).not.toBe(
      snapshotFingerprint({ l: [2, 1] }),
    );
  });
});
