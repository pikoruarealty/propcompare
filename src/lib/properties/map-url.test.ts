import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl, mapEmbedUrl } from "./map-url";

describe("isGoogleMapsUrl", () => {
  it.each([
    "https://www.google.com/maps/place/Anamika+High+Point/@23.0369,72.5079,17z",
    "https://maps.app.goo.gl/AbCdEf123",
    "https://goo.gl/maps/AbCdEf",
    "https://maps.google.com/?q=23.0369,72.5079",
    "https://www.google.com/maps/embed?pb=!1m18!1m12",
    "https://www.google.co.in/maps?q=Anamika",
  ])("accepts %s", (link) => {
    expect(isGoogleMapsUrl(link)).toBe(true);
  });

  it.each([
    "http://www.google.com/maps/place/x",
    "https://evil.example/maps/place/x",
    "https://www.google.com.evil.example/maps/place/x",
    "https://www.google.com/search?q=maps",
    "https://user:pass@www.google.com/maps",
    "javascript:alert(1)",
    "not a link",
    `https://www.google.com/maps/${"a".repeat(2100)}`,
  ])("refuses %s", (link) => {
    expect(isGoogleMapsUrl(link)).toBe(false);
  });
});

describe("mapEmbedUrl", () => {
  it("uses an embed link as it is", () => {
    const embed = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3";
    expect(mapEmbedUrl(embed)).toBe(embed);
  });

  it("draws a pin in the address, preferring the exact data pin", () => {
    expect(
      mapEmbedUrl(
        "https://www.google.com/maps/place/Anamika/@23.0369,72.5079,17z",
      ),
    ).toBe("https://www.google.com/maps?q=23.0369%2C72.5079&z=16&output=embed");
    expect(
      mapEmbedUrl(
        "https://www.google.com/maps/place/Anamika/@23.0,72.0,17z/data=!3d23.0369!4d72.5079",
      ),
    ).toBe("https://www.google.com/maps?q=23.0369%2C72.5079&z=16&output=embed");
  });

  it("draws coordinates or text given as a query", () => {
    expect(mapEmbedUrl("https://maps.google.com/?q=23.0369,72.5079")).toContain(
      "q=23.0369%2C72.5079",
    );
    expect(
      mapEmbedUrl("https://www.google.com/maps?q=Anamika+High+Point"),
    ).toBe(
      "https://www.google.com/maps?q=Anamika%20High%20Point&z=16&output=embed",
    );
    expect(
      mapEmbedUrl(
        "https://www.google.com/maps/search/?api=1&query=Anamika+High+Point",
      ),
    ).toContain("Anamika%20High%20Point");
  });

  it("draws a place page by its name when there is no pin", () => {
    expect(
      mapEmbedUrl("https://www.google.com/maps/place/Anamika+High+Point"),
    ).toContain("Anamika%20High%20Point");
  });

  it("does not invent a map for a short link, an out-of-range pin, or something that is not maps", () => {
    expect(mapEmbedUrl("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(
      mapEmbedUrl("https://www.google.com/maps/@123.0,72.0,17z"),
    ).toBeNull();
    expect(mapEmbedUrl("https://example.com/maps")).toBeNull();
    expect(mapEmbedUrl(null)).toBeNull();
  });
});
