import { describe, expect, it } from "vitest";
import { callerKey, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit in a window and refuses the rest", () => {
    const limiter = createRateLimiter(3, 1000);
    const results = [1, 2, 3, 4, 5].map(() => limiter.allow("a", 0));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("counts each caller separately", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(false);
    expect(limiter.allow("b", 1)).toBe(true);
  });

  it("starts a fresh window once the last one has passed", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 999)).toBe(false);
    expect(limiter.allow("a", 1000)).toBe(true);
  });

  it("stays bounded: with the map full of live callers a newcomer passes uncounted", () => {
    const limiter = createRateLimiter(1, 1000);
    for (let i = 0; i < 10_000; i += 1) limiter.allow(`k${i}`, 0);
    expect(limiter.allow("newcomer", 1)).toBe(true);
    expect(limiter.allow("newcomer", 2)).toBe(true);
    // Once those windows expire the sweep makes room again.
    expect(limiter.allow("later", 5000)).toBe(true);
    expect(limiter.allow("later", 5001)).toBe(false);
  });
});

describe("callerKey", () => {
  const of = (headers: Record<string, string>) =>
    callerKey(new Headers(headers));

  it("takes the first address a proxy forwarded", () => {
    expect(of({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })).toBe(
      "203.0.113.5",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(of({ "x-real-ip": "203.0.113.9" })).toBe("203.0.113.9");
  });

  it("has no key without either header, so nothing is limited", () => {
    expect(of({})).toBeNull();
    expect(of({ "x-forwarded-for": " " })).toBeNull();
  });
});
