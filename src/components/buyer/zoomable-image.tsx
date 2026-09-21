"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import {
  clampScale,
  distanceBetween,
  DOUBLE_CLICK_SCALE,
  INITIAL_ZOOM,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  scaleForWheel,
  ZOOM_STEP,
  zoomAround,
  zoomPercent,
  type Offset,
  type ZoomState,
} from "@/lib/properties/zoom";

/** Two taps closer than this in time, and this many pixels, count as a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 24;

/**
 * A picture that can be zoomed and moved about inside its frame: the +/- buttons,
 * the mouse wheel or a trackpad pinch, a double-click or double-tap, a drag to
 * pan, a two-finger pinch on a touch screen, and the +, - and 0 keys. It starts
 * fitted (100%) and Reset returns to it. The maths lives in `lib/properties/zoom`.
 *
 * Mount it with a `key` per picture so that moving to another picture starts
 * again at fit rather than carrying the last picture's zoom over.
 */
export function ZoomableImage({
  src,
  alt,
  maxHeightClass = "max-h-[68vh]",
}: {
  src: string;
  alt: string;
  maxHeightClass?: string;
}) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = React.useState<ZoomState>(INITIAL_ZOOM);
  // Event handlers registered once read the latest state from here.
  const zoomRef = React.useRef(zoom);
  const [dragging, setDragging] = React.useState(false);

  const commit = React.useCallback((next: ZoomState) => {
    zoomRef.current = next;
    setZoom(next);
  }, []);

  /** The frame and the picture as laid out at fit, in pixels. */
  const measure = React.useCallback(() => {
    const frame = frameRef.current?.getBoundingClientRect();
    const image = imageRef.current;
    return {
      frame: { width: frame?.width ?? 0, height: frame?.height ?? 0 },
      content: {
        width: image?.offsetWidth ?? 0,
        height: image?.offsetHeight ?? 0,
      },
      left: frame?.left ?? 0,
      top: frame?.top ?? 0,
    };
  }, []);

  /** A screen point as an offset from the middle of the frame. */
  const fromCentre = React.useCallback(
    (clientX: number, clientY: number): Offset => {
      const { frame, left, top } = measure();
      return {
        x: clientX - left - frame.width / 2,
        y: clientY - top - frame.height / 2,
      };
    },
    [measure],
  );

  const zoomTo = React.useCallback(
    (scale: number, focus: Offset = { x: 0, y: 0 }) => {
      const { frame, content } = measure();
      commit(zoomAround(zoomRef.current, scale, focus, frame, content));
    },
    [commit, measure],
  );

  const zoomIn = React.useCallback(
    () => zoomTo(zoomRef.current.scale * ZOOM_STEP),
    [zoomTo],
  );
  const zoomOut = React.useCallback(
    () => zoomTo(zoomRef.current.scale / ZOOM_STEP),
    [zoomTo],
  );
  const reset = React.useCallback(() => commit(INITIAL_ZOOM), [commit]);

  // The wheel needs a non-passive listener: React's onWheel is passive, so it
  // could not stop the page (or a trackpad pinch) from zooming the whole window.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo(
        scaleForWheel(zoomRef.current.scale, event.deltaY),
        fromCentre(event.clientX, event.clientY),
      );
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomTo, fromCentre]);

  // +, - and 0 while the pop-up is open. Arrow keys are left alone: they move
  // between pictures.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") zoomIn();
      else if (event.key === "-" || event.key === "_") zoomOut();
      else if (event.key === "0") reset();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [zoomIn, zoomOut, reset]);

  const pointers = React.useRef(new Map<number, Offset>());
  const pinchStart = React.useRef<{ distance: number; scale: number } | null>(
    null,
  );
  const lastTap = React.useRef<{ at: number; x: number; y: number } | null>(
    null,
  );

  const toggleZoomAt = (clientX: number, clientY: number) => {
    if (zoomRef.current.scale > MIN_SCALE) reset();
    else zoomTo(DOUBLE_CLICK_SCALE, fromCentre(clientX, clientY));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A button in the frame (zoom controls) handles its own press.
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        distance: distanceBetween(a, b),
        scale: zoomRef.current.scale,
      };
    }
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = distanceBetween(a, b);
      if (pinchStart.current.distance > 0) {
        zoomTo(
          clampScale(
            pinchStart.current.scale * (distance / pinchStart.current.distance),
          ),
          fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2),
        );
      }
      return;
    }

    const { frame, content } = measure();
    commit(
      panBy(
        zoomRef.current,
        { x: point.x - previous.x, y: point.y - previous.y },
        frame,
        content,
      ),
    );
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    pinchStart.current = null;
    if (pointers.current.size === 0) setDragging(false);

    // Touch screens do not reliably send a double-click, so detect a double-tap.
    if (event.pointerType !== "mouse" && event.type === "pointerup") {
      const now = event.timeStamp;
      const last = lastTap.current;
      if (
        last &&
        now - last.at < DOUBLE_TAP_MS &&
        distanceBetween(last, { x: event.clientX, y: event.clientY }) <
          DOUBLE_TAP_PX
      ) {
        lastTap.current = null;
        toggleZoomAt(event.clientX, event.clientY);
      } else {
        lastTap.current = { at: now, x: event.clientX, y: event.clientY };
      }
    }
  };

  const zoomed = zoom.scale > MIN_SCALE;

  return (
    <div
      ref={frameRef}
      data-slot="zoom-frame"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        toggleZoomAt(event.clientX, event.clientY);
      }}
      className={`bg-muted relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden rounded-md select-none ${
        zoomed
          ? dragging
            ? "cursor-grabbing"
            : "cursor-grab"
          : "cursor-zoom-in"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        data-zoom={zoom.scale}
        style={{
          transform: `translate(${zoom.offset.x}px, ${zoom.offset.y}px) scale(${zoom.scale})`,
        }}
        className={`${maxHeightClass} w-auto max-w-full object-contain will-change-transform`}
      />
      <div
        data-slot="zoom-controls"
        className="border-border bg-card/90 absolute right-2 bottom-2 flex items-center gap-1 rounded-md border p-1 text-sm"
      >
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom.scale <= MIN_SCALE}
          onClick={zoomOut}
          className="hover:bg-muted rounded p-1.5 disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          disabled={!zoomed}
          onClick={reset}
          data-slot="zoom-level"
          className="hover:bg-muted min-w-12 rounded px-1.5 py-1 text-center tabular-nums disabled:opacity-100"
        >
          {zoomPercent(zoom.scale)}
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom.scale >= MAX_SCALE}
          onClick={zoomIn}
          className="hover:bg-muted rounded p-1.5 disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
