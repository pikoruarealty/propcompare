"use client";

import {
  RANGE_MAX_LAKH,
  RANGE_MIN_LAKH,
  RANGE_STEP_LAKH,
  type StatedRange,
  formatStatedFigure,
  formatStatedRange,
  rangePercent,
  withLowerEnd,
  withUpperEnd,
} from "@/lib/properties/intake";
import { TabularValue } from "./typography";

/**
 * A two-handle slider for the range a buyer says they are working with.
 *
 * **This is not a price control and must never read as one.** Nothing in this
 * catalog is priced, and no property figure is shown against what is set here.
 * Three things carry that: the scale steps in five-lakh notches rather than
 * rupees, so no exact figure is implied; the top of the scale is open-ended
 * ("or more"), so the control never puts a ceiling in the buyer's mouth; and
 * the value is described throughout as the buyer's own statement. The slider
 * form was chosen by the maintainer on 2026-09-07 (DECISIONS.md) over typed
 * figures and over preset bands — bands would be a bucket, and buckets are the
 * private matching mechanism, not a buyer-facing control.
 *
 * It is built from two native `<input type="range">` elements rather than
 * Radix's `Slider`. Two reasons: each handle then has a real, individually
 * labelled form control that assistive technology and tests can address
 * directly, and Radix's slider measures itself with `ResizeObserver`, which
 * jsdom does not implement — so the one interactive control in this phase would
 * have been the one control its tests could not drive.
 *
 * The inputs are transparent and sit over a drawn track; `pointer-events` are
 * disabled on the inputs and re-enabled on their thumbs, which is what lets two
 * overlapping full-width sliders each stay grabbable.
 */

const THUMB = [
  "[&::-webkit-slider-thumb]:pointer-events-auto",
  "[&::-webkit-slider-thumb]:appearance-none",
  "[&::-webkit-slider-thumb]:size-5",
  "[&::-webkit-slider-thumb]:rounded-full",
  "[&::-webkit-slider-thumb]:border-2",
  "[&::-webkit-slider-thumb]:border-background",
  "[&::-webkit-slider-thumb]:bg-primary",
  "[&::-webkit-slider-thumb]:cursor-grab",
  "[&:focus-visible::-webkit-slider-thumb]:ring-ring",
  "[&:focus-visible::-webkit-slider-thumb]:ring-2",
  "[&:focus-visible::-webkit-slider-thumb]:ring-offset-2",
  "[&::-moz-range-thumb]:pointer-events-auto",
  "[&::-moz-range-thumb]:size-5",
  "[&::-moz-range-thumb]:rounded-full",
  "[&::-moz-range-thumb]:border-2",
  "[&::-moz-range-thumb]:border-background",
  "[&::-moz-range-thumb]:bg-primary",
  "[&::-moz-range-thumb]:cursor-grab",
  "[&:focus-visible::-moz-range-thumb]:ring-ring",
  "[&:focus-visible::-moz-range-thumb]:ring-2",
].join(" ");

const INPUT_CLASS = `pointer-events-none absolute inset-x-0 top-1/2 m-0 h-5 w-full -translate-y-1/2 appearance-none bg-transparent focus:outline-none ${THUMB}`;

export interface StatedRangeSliderProps {
  value: StatedRange;
  onChange: (next: StatedRange) => void;
}

export function StatedRangeSlider({ value, onChange }: StatedRangeSliderProps) {
  const from = rangePercent(value.fromLakh);
  const to = rangePercent(value.toLakh);

  return (
    <div data-slot="stated-range" className="flex flex-col gap-4">
      <p
        data-slot="stated-range-readout"
        className="text-foreground text-lg"
        aria-live="polite"
      >
        You said{" "}
        <TabularValue className="font-medium">
          {formatStatedRange(value)}
        </TabularValue>
      </p>

      <div className="relative h-10 w-full">
        {/* The drawn track. Purely presentational — the inputs above it carry
            every value, label, and keyboard interaction. */}
        <div
          aria-hidden="true"
          className="bg-input absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        >
          <div
            data-slot="stated-range-fill"
            className="bg-primary absolute h-full rounded-full"
            style={{ left: `${from}%`, width: `${Math.max(to - from, 0)}%` }}
          />
        </div>

        <input
          type="range"
          aria-label="Lower end of the range you are working with"
          aria-valuetext={formatStatedFigure(value.fromLakh)}
          min={RANGE_MIN_LAKH}
          max={RANGE_MAX_LAKH}
          step={RANGE_STEP_LAKH}
          value={value.fromLakh}
          onChange={(event) =>
            onChange(withLowerEnd(value, Number(event.target.value)))
          }
          className={INPUT_CLASS}
        />
        <input
          type="range"
          aria-label="Upper end of the range you are working with"
          aria-valuetext={
            value.toLakh >= RANGE_MAX_LAKH
              ? `${formatStatedFigure(value.toLakh)} or more`
              : formatStatedFigure(value.toLakh)
          }
          min={RANGE_MIN_LAKH}
          max={RANGE_MAX_LAKH}
          step={RANGE_STEP_LAKH}
          value={value.toLakh}
          onChange={(event) =>
            onChange(withUpperEnd(value, Number(event.target.value)))
          }
          className={INPUT_CLASS}
        />
      </div>

      <div className="text-muted-foreground flex justify-between text-xs">
        <TabularValue>{formatStatedFigure(RANGE_MIN_LAKH)}</TabularValue>
        <TabularValue>
          {formatStatedFigure(RANGE_MAX_LAKH)} or more
        </TabularValue>
      </div>
    </div>
  );
}
