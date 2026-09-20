import { describe, expect, it } from "vitest";
import {
  clampOffset,
  clampScale,
  DOUBLE_CLICK_SCALE,
  INITIAL_ZOOM,
  MAX_SCALE,
  panBy,
  scaleForWheel,
  zoomAround,
  zoomPercent,
} from "./zoom";

const frame = { width: 800, height: 600 };
const content = { width: 800, height: 600 };

describe("clampScale", () => {
  it("keeps the scale between fit and the maximum", () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });

  it("falls back to fit for something that is not a number", () => {
    expect(clampScale(NaN)).toBe(1);
    expect(clampScale(Infinity)).toBe(1);
  });
});

describe("clampOffset", () => {
  it("does not let the picture move when it fits the frame", () => {
    expect(clampOffset({ x: 50, y: -50 }, 1, frame, content)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("lets it move only until its edge reaches the frame's edge", () => {
    // At 2x an 800 by 600 picture is 1600 by 1200: 400 px of slack each side
    // horizontally and 300 vertically.
    expect(clampOffset({ x: 999, y: 999 }, 2, frame, content)).toEqual({
      x: 400,
      y: 300,
    });
    expect(clampOffset({ x: -999, y: -999 }, 2, frame, content)).toEqual({
      x: -400,
      y: -300,
    });
    expect(clampOffset({ x: 120, y: -40 }, 2, frame, content)).toEqual({
      x: 120,
      y: -40,
    });
  });

  it("copes with a picture narrower than its frame: it pans only once it outgrows it", () => {
    const narrow = { width: 300, height: 600 };
    expect(clampOffset({ x: 200, y: 0 }, 2, frame, narrow).x).toBe(0);
    expect(clampOffset({ x: 900, y: 0 }, 4, frame, narrow).x).toBe(200);
  });
});

describe("zoomAround", () => {
  it("returns the same state when the scale does not change", () => {
    expect(zoomAround(INITIAL_ZOOM, 1, { x: 10, y: 10 }, frame, content)).toBe(
      INITIAL_ZOOM,
    );
  });

  it("zooming about the centre needs no offset", () => {
    const zoomed = zoomAround(INITIAL_ZOOM, 2, { x: 0, y: 0 }, frame, content);
    expect(zoomed.scale).toBe(2);
    expect(zoomed.offset).toEqual({ x: 0, y: 0 });
  });

  it("keeps the point under the cursor where it is", () => {
    const focus = { x: 200, y: -100 };
    const before = INITIAL_ZOOM;
    const after = zoomAround(before, 2, focus, frame, content);

    // The picture point under the cursor before: focus = offset + scale * point.
    const point = {
      x: (focus.x - before.offset.x) / before.scale,
      y: (focus.y - before.offset.y) / before.scale,
    };
    // After zooming it must still be under the cursor.
    expect(after.offset.x + after.scale * point.x).toBeCloseTo(focus.x, 9);
    expect(after.offset.y + after.scale * point.y).toBeCloseTo(focus.y, 9);
  });

  it("keeps it there again when zooming in further from an already-panned view", () => {
    const start = { scale: 2, offset: { x: 120, y: -60 } };
    const focus = { x: -150, y: 90 };
    const after = zoomAround(start, 3, focus, frame, content);

    const point = {
      x: (focus.x - start.offset.x) / start.scale,
      y: (focus.y - start.offset.y) / start.scale,
    };
    expect(after.offset.x + after.scale * point.x).toBeCloseTo(focus.x, 9);
    expect(after.offset.y + after.scale * point.y).toBeCloseTo(focus.y, 9);
  });

  it("returns exactly to fit when zoomed back out to 1", () => {
    const zoomed = zoomAround(
      INITIAL_ZOOM,
      3,
      { x: 300, y: 200 },
      frame,
      content,
    );
    expect(zoomAround(zoomed, 1, { x: 300, y: 200 }, frame, content)).toBe(
      INITIAL_ZOOM,
    );
    expect(zoomAround(zoomed, 0.1, { x: 0, y: 0 }, frame, content)).toBe(
      INITIAL_ZOOM,
    );
  });

  it("never zooms past the maximum", () => {
    expect(
      zoomAround(INITIAL_ZOOM, 50, { x: 0, y: 0 }, frame, content).scale,
    ).toBe(MAX_SCALE);
  });

  it("never leaves the picture out of the frame after zooming near an edge", () => {
    const zoomed = zoomAround(
      INITIAL_ZOOM,
      DOUBLE_CLICK_SCALE,
      { x: 400, y: 300 },
      frame,
      content,
    );
    // Clicking a corner would want a bigger shift than the slack allows.
    expect(Math.abs(zoomed.offset.x)).toBeLessThanOrEqual(600);
    expect(Math.abs(zoomed.offset.y)).toBeLessThanOrEqual(450);
  });
});

describe("panBy", () => {
  it("does nothing while the picture is at fit", () => {
    expect(panBy(INITIAL_ZOOM, { x: 30, y: 30 }, frame, content)).toBe(
      INITIAL_ZOOM,
    );
  });

  it("moves a zoomed picture by the drag, within its edges", () => {
    const zoomed = { scale: 2, offset: { x: 100, y: 0 } };
    expect(panBy(zoomed, { x: 50, y: -20 }, frame, content).offset).toEqual({
      x: 150,
      y: -20,
    });
    expect(panBy(zoomed, { x: 5000, y: 0 }, frame, content).offset.x).toBe(400);
  });
});

describe("wheel and labels", () => {
  it("zooms in when the wheel turns forward and out when it turns back", () => {
    expect(scaleForWheel(1, -100)).toBeGreaterThan(1);
    expect(scaleForWheel(2, 100)).toBeLessThan(2);
    expect(scaleForWheel(1, 100)).toBe(1);
    expect(scaleForWheel(MAX_SCALE, -1000)).toBe(MAX_SCALE);
  });

  it("reads a scale as a percentage", () => {
    expect(zoomPercent(1)).toBe("100%");
    expect(zoomPercent(2.5)).toBe("250%");
    expect(zoomPercent(1.5)).toBe("150%");
  });
});
