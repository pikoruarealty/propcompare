import { describe, expect, it } from "vitest";
import { EMPTY_ANSWERS } from "./intake";
import {
  consumePendingIntakeClaim,
  setPendingIntakeClaim,
} from "./pending-intake-claim";

describe("pending intake claim", () => {
  it("returns null when nothing was set", () => {
    expect(consumePendingIntakeClaim()).toBeNull();
  });

  it("returns what was set, once, then clears it", () => {
    setPendingIntakeClaim(EMPTY_ANSWERS);
    expect(consumePendingIntakeClaim()).toEqual(EMPTY_ANSWERS);
    expect(consumePendingIntakeClaim()).toBeNull();
  });
});
