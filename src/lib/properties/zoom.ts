/**
 * The arithmetic of zooming and panning a picture in the pop-up, kept apart from
 * the component so the rules can be tested without a browser.
 *
 * The picture is centred in its frame and transformed with
 * `translate(x, y) scale(s)` about the frame's centre. A point is described
 * relative to that centre, in pixels.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
export const ZOOM_STEP = 1.5;
/** What a double-click or double-tap zooms to. */
export const DOUBLE_CLICK_SCALE = 2.5;

export interface Offset {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ZoomState {
  scale: number;
  offset: Offset;
}

export const INITIAL_ZOOM: ZoomState = { scale: 1, offset: { x: 0, y: 0 } };

export const clampScale = (scale: number): number =>
  Number.isFinite(scale) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) : 1;

/**
 * Keeps the picture from being dragged out of view: it may move only as far as
 * its edge reaching the frame's edge, and not at all when it fits the frame.
 */
export const clampOffset = (
  offset: Offset,
  scale: number,
  frame: Size,
  content: Size,
): Offset => {
  const limit = (framePx: number, contentPx: number) =>
    Math.max(0, (contentPx * scale - framePx) / 2);
  const maxX = limit(frame.width, content.width);
  const maxY = limit(frame.height, content.height);
  return {
    // `|| 0` turns a negative zero (from -0 limits) into a plain zero.
    x: Math.min(maxX, Math.max(-maxX, offset.x)) || 0,
    y: Math.min(maxY, Math.max(-maxY, offset.y)) || 0,
  };
};

/**
 * Zooms to `nextScale` while keeping the picture point under `focus` where it is
 * (the cursor, or the middle of a pinch), so the picture grows around the thing
 * being looked at rather than around its own centre.
 */
export const zoomAround = (
  state: ZoomState,
  nextScale: number,
  focus: Offset,
  frame: Size,
  content: Size,
): ZoomState => {
  const scale = clampScale(nextScale);
  if (scale === state.scale) return state;
  if (scale === MIN_SCALE) return INITIAL_ZOOM;
  const ratio = scale / state.scale;
  return {
    scale,
    offset: clampOffset(
      {
        x: focus.x - (focus.x - state.offset.x) * ratio,
        y: focus.y - (focus.y - state.offset.y) * ratio,
      },
      scale,
      frame,
      content,
    ),
  };
};

/** Pan by a drag, kept inside the picture's edges. */
export const panBy = (
  state: ZoomState,
  delta: Offset,
  frame: Size,
  content: Size,
): ZoomState =>
  state.scale === MIN_SCALE
    ? state
    : {
        scale: state.scale,
        offset: clampOffset(
          { x: state.offset.x + delta.x, y: state.offset.y + delta.y },
          state.scale,
          frame,
          content,
        ),
      };

/** The next scale for a wheel turn: forward (negative deltaY) zooms in. */
export const scaleForWheel = (scale: number, deltaY: number): number =>
  clampScale(scale * Math.exp(-deltaY * 0.0025));

export const zoomPercent = (scale: number): string =>
  `${Math.round(scale * 100)}%`;

export const distanceBetween = (a: Offset, b: Offset): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
