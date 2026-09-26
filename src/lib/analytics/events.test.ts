import { describe, expect, it } from "vitest";
import {
  budgetBandOf,
  cleanTag,
  deviceOf,
  isAutomated,
  optedOut,
  readEventInput,
  recordingMode,
  referrerDomainOf,
} from "./events";

describe("readEventInput", () => {
  it("accepts a known event with what it needs, and keeps only the allowed detail", () => {
    expect(
      readEventInput({
        event: "compare_group_opened",
        slugs: ["amaris", "maruti-360"],
        detail: { group: "rooms", note: "free text is dropped" },
      }),
    ).toMatchObject({
      event: "compare_group_opened",
      slugs: ["amaris", "maruti-360"],
      detail: { group: "rooms" },
    });
  });

  it("refuses an unknown event, a missing property, and detail that does not fit", () => {
    for (const body of [
      null,
      "x",
      { event: "price_viewed", slug: "amaris" },
      { event: "property_viewed" },
      { event: "property_viewed", slug: "Not A Slug!" },
      { event: "compare_opened", slugs: [] },
      {
        event: "compare_group_opened",
        slugs: ["a"],
        detail: { group: "prices" },
      },
      {
        event: "compare_focus_set",
        slugs: ["a"],
        detail: { focus: ["price"] },
      },
      {
        event: "compare_unit_switched",
        slug: "a",
        detail: { unitVariantId: "x" },
      },
      {
        event: "comparison_removed",
        slug: "a",
        detail: { where: "elsewhere" },
      },
      { event: "page_engaged", engagedMs: 500, detail: { page: "compare" } },
      { event: "page_engaged", engagedMs: 5000, detail: { page: "admin" } },
    ]) {
      expect(readEventInput(body)).toBeNull();
    }
  });

  it("caps a visible-time report at thirty minutes", () => {
    expect(
      readEventInput({
        event: "page_engaged",
        slug: "amaris",
        engagedMs: 99 * 60 * 1000,
        detail: { page: "dossier" },
      })?.engagedMs,
    ).toBe(30 * 60 * 1000);
  });

  it("keeps a band only from the fixed list, never a figure", () => {
    expect(
      readEventInput({
        event: "property_viewed",
        slug: "a",
        band: "₹2–3 crore",
      })?.budgetBand,
    ).toBe("₹2–3 crore");
    expect(
      readEventInput({
        event: "property_viewed",
        slug: "a",
        band: "₹2,40,00,000",
      })?.budgetBand,
    ).toBeNull();
  });

  it("keeps intake's choices and drops anything else", () => {
    expect(
      readEventInput({
        event: "intake_completed",
        detail: {
          priorities: ["family_space", "family_space", "hack"],
          bhk: "3bhk",
          city: "Ahmedabad",
          statedRange: { fromLakh: 150, toLakh: 250 },
        },
      })?.detail,
    ).toEqual({ priorities: ["family_space"], bhk: "3bhk", city: "Ahmedabad" });
  });
});

describe("budgetBandOf", () => {
  it("puts a stated ceiling in its band, the top of the slider open-ended", () => {
    expect(budgetBandOf(50)).toBe("Up to ₹50 lakh");
    expect(budgetBandOf(100)).toBe("₹75 lakh–1 crore");
    expect(budgetBandOf(250)).toBe("₹2–3 crore");
    expect(budgetBandOf(495)).toBe("₹3–5 crore");
    expect(budgetBandOf(500)).toBe("₹5 crore or more");
  });
});

describe("the request's context", () => {
  it("reads the device, crawlers and privacy signals", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile")).toBe(
      "mobile",
    );
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "desktop",
    );
    expect(isAutomated("WhatsApp/2.23")).toBe(true);
    expect(isAutomated("Googlebot/2.1")).toBe(true);
    expect(isAutomated(null)).toBe(true);
    expect(isAutomated("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
    expect(optedOut(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(optedOut(new Headers({ dnt: "1" }))).toBe(true);
    expect(optedOut(new Headers())).toBe(false);
    const browser = "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0";
    expect(recordingMode(new Headers({ "user-agent": browser }))).toBe(
      "identified",
    );
    expect(
      recordingMode(new Headers({ "user-agent": browser, "sec-gpc": "1" })),
    ).toBe("anonymous");
    expect(
      recordingMode(new Headers({ "user-agent": browser, dnt: "1" })),
    ).toBe("anonymous");
    expect(recordingMode(new Headers({ "user-agent": "Googlebot/2.1" }))).toBe(
      "none",
    );
  });

  it("keeps only the referring domain, and not our own", () => {
    expect(
      referrerDomainOf("https://www.google.com/search?q=x", "propcompare.in"),
    ).toBe("google.com");
    expect(
      referrerDomainOf("https://propcompare.in/properties", "propcompare.in"),
    ).toBeNull();
    expect(referrerDomainOf("javascript:alert(1)", null)).toBeNull();
    expect(referrerDomainOf("not a url", null)).toBeNull();
    expect(cleanTag("  Instagram Story!! ")).toBe("instagram-story");
    expect(cleanTag("")).toBeNull();
  });
});
