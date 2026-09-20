"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SubmissionLookups } from "@/lib/submissions/queue";
import {
  emptyRoomForm,
  emptyVariantForm,
  type RoomForm,
  type VariantForm,
} from "@/lib/submissions/variant-form";
import { dimensionsWarning } from "@/lib/units/measurements";
import { inputClass, labelClass } from "./form-classes";

const BASES = [
  { value: "carpet", label: "Carpet" },
  { value: "built_up", label: "Built-up" },
  { value: "super_built_up", label: "Super built-up" },
] as const;

const roomCount = (variant: VariantForm): number =>
  variant.rooms.length + variant.balconies.length + (variant.foyer ? 1 : 0);

/**
 * Edits the unit types (configurations) of a project, one tab per unit type and,
 * inside it, tabs for the details (name, bedroom type, layout, counts), the
 * measured areas, and the room dimensions (rooms, balconies, foyer). Anything left
 * blank is simply not stated.
 *
 * A unit type that is already published is identified by its name, so its name is
 * locked (renaming would add a second type). Removing one is allowed: it is sent
 * as a removal and hidden from buyers when published (never deleted, so its price
 * history and saved comparisons stay intact), and adding a type with the same name
 * later brings it back. A type added in this edit can be renamed and removed freely.
 */
export function UnitVariantsEditor({
  value,
  onChange,
  lookups,
  lockedNames = [],
}: {
  value: VariantForm[];
  onChange: (next: VariantForm[]) => void;
  lookups: SubmissionLookups;
  /** Names of unit types already published, which cannot be renamed or removed. */
  lockedNames?: string[];
}) {
  const [active, setActive] = React.useState("0");
  const update = (index: number, patch: Partial<VariantForm>) =>
    onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const isLocked = (variant: VariantForm) =>
    lockedNames.some(
      (name) => name.toLowerCase() === variant.variantName.trim().toLowerCase(),
    );

  // The selection can outlive the type it pointed at (removed, or the list
  // shrank); fall back to the last one.
  const selected = String(Math.min(Number(active), value.length - 1));

  return (
    <div className="flex flex-col gap-4" data-slot="unit-variants-editor">
      <Tabs value={selected} onValueChange={setActive}>
        <TabsList aria-label="Unit types">
          {value.map((variant, index) => (
            <TabsTrigger
              key={index}
              value={String(index)}
              title={variant.variantName || "New unit type"}
            >
              <span className="truncate">
                {variant.variantName.trim() || "New unit type"}
              </span>
            </TabsTrigger>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange([...value, emptyVariantForm()]);
              setActive(String(value.length));
            }}
            className="text-primary hover:bg-muted -mb-px inline-flex shrink-0 items-center gap-1 px-3 py-2.5 text-sm font-medium"
          >
            <Plus className="size-4" aria-hidden="true" /> Add a unit type
          </button>
        </TabsList>

        {value.map((variant, index) => {
          const locked = isLocked(variant);
          return (
            <TabsContent key={index} value={String(index)}>
              <Tabs defaultValue="details">
                <TabsList aria-label={`Sections of unit type ${index + 1}`}>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="areas">
                    Areas
                    <Count
                      n={variant.areas.filter((a) => a.areaSqft.trim()).length}
                    />
                  </TabsTrigger>
                  <TabsTrigger value="rooms">
                    Rooms
                    <Count n={roomCount(variant)} />
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details">
                  <DetailsTab
                    index={index}
                    variant={variant}
                    locked={locked}
                    lookups={lookups}
                    update={update}
                  />
                </TabsContent>

                <TabsContent value="areas">
                  <AreasTab index={index} variant={variant} update={update} />
                </TabsContent>

                <TabsContent value="rooms">
                  <RoomsTab index={index} variant={variant} update={update} />
                </TabsContent>
              </Tabs>

              {
                <div className="mt-6">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onChange(value.filter((_, i) => i !== index));
                      setActive(String(Math.max(0, index - 1)));
                    }}
                  >
                    <Trash2 /> Remove this unit type
                  </Button>
                  {locked ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Already published: it is hidden from buyers when this is
                      published, and can be brought back by adding a type with
                      the same name.
                    </p>
                  ) : null}
                </div>
              }
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return n > 0 ? (
    <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">
      {n}
    </span>
  ) : null;
}

type Update = (index: number, patch: Partial<VariantForm>) => void;

function DetailsTab({
  index,
  variant,
  locked,
  lookups,
  update,
}: {
  index: number;
  variant: VariantForm;
  locked: boolean;
  lookups: SubmissionLookups;
  update: Update;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-2 md:col-span-2">
        <span className={labelClass}>Name</span>
        <input
          className={inputClass}
          value={variant.variantName}
          disabled={locked}
          onChange={(e) => update(index, { variantName: e.target.value })}
          placeholder="e.g. 3 BHK — Type A"
        />
        {locked ? (
          <span className="text-muted-foreground text-xs">
            Already published, so its name is fixed. Everything else can be
            changed, or the whole type removed.
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Bedrooms</span>
        <select
          className={inputClass}
          value={variant.bhkTypeKey}
          onChange={(e) => update(index, { bhkTypeKey: e.target.value })}
        >
          <option value="">Not stated</option>
          {lookups.bhkTypes.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Layout</span>
        <select
          className={inputClass}
          value={variant.layoutTypeKey}
          onChange={(e) => update(index, { layoutTypeKey: e.target.value })}
        >
          <option value="">Not stated</option>
          {lookups.layoutTypes.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Units of this type</span>
        <input
          className={inputClass}
          inputMode="numeric"
          value={variant.totalUnitsOfVariant}
          onChange={(e) =>
            update(index, { totalUnitsOfVariant: e.target.value })
          }
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Per floor</span>
        <input
          className={inputClass}
          inputMode="numeric"
          value={variant.unitsPerFloor}
          onChange={(e) => update(index, { unitsPerFloor: e.target.value })}
        />
      </label>
    </div>
  );
}

function AreasTab({
  index,
  variant,
  update,
}: {
  index: number;
  variant: VariantForm;
  update: Update;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>Areas (sq ft)</span>
      {variant.areas.map((area, areaIndex) => (
        <div key={areaIndex} className="flex items-center gap-2">
          <select
            aria-label={`Area basis ${areaIndex + 1} for unit type ${index + 1}`}
            className={`${inputClass} max-w-48`}
            value={area.basis}
            onChange={(e) =>
              update(index, {
                areas: variant.areas.map((a, i) =>
                  i === areaIndex
                    ? { ...a, basis: e.target.value as typeof a.basis }
                    : a,
                ),
              })
            }
          >
            {BASES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <input
            aria-label={`Area ${areaIndex + 1} for unit type ${index + 1}`}
            className={inputClass}
            inputMode="decimal"
            value={area.areaSqft}
            onChange={(e) =>
              update(index, {
                areas: variant.areas.map((a, i) =>
                  i === areaIndex ? { ...a, areaSqft: e.target.value } : a,
                ),
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove this area"
            onClick={() =>
              update(index, {
                areas: variant.areas.filter((_, i) => i !== areaIndex),
              })
            }
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            update(index, {
              areas: [...variant.areas, { basis: "carpet", areaSqft: "" }],
            })
          }
        >
          <Plus /> Add an area
        </Button>
      </div>
    </div>
  );
}

function RoomsTab({
  index,
  variant,
  update,
}: {
  index: number;
  variant: VariantForm;
  update: Update;
}) {
  // Judged on what is in the form now, so it updates as a person corrects it.
  const number = (text: string) => {
    const n = Number(text);
    return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const warning = dimensionsWarning(
    [...variant.rooms, ...variant.balconies].map((room) => ({
      name: room.name || "A room",
      lengthFt: number(room.lengthFt),
      widthFt: number(room.widthFt),
      areaSqft: number(room.areaSqft),
    })),
  );
  return (
    <div className="flex flex-col gap-6" data-slot="rooms-tab">
      {warning ? (
        <p
          role="note"
          data-slot="unit-warning"
          className="border-destructive/40 text-destructive rounded-md border p-3 text-sm"
        >
          Check the unit. {warning} Sizes here are in feet and square feet;
          convert from metres (1 m is 3.28 ft) before saving.
        </p>
      ) : null}
      <RoomRows
        title="Rooms"
        addLabel="Add a room"
        rows={variant.rooms}
        onChange={(rooms) => update(index, { rooms })}
      />
      <RoomRows
        title="Balconies"
        addLabel="Add a balcony"
        rows={variant.balconies}
        onChange={(balconies) => update(index, { balconies })}
      />
      <div className="flex flex-col gap-2">
        <span className={labelClass}>Foyer</span>
        {variant.foyer ? (
          <RoomRow
            title="Foyer"
            position={0}
            room={variant.foyer}
            onChange={(foyer) => update(index, { foyer })}
            onRemove={() => update(index, { foyer: null })}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update(index, { foyer: emptyRoomForm() })}
            >
              <Plus /> Add a foyer
            </Button>
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Give each room a length and width in feet, or an area in square feet.
        Removing a room here removes it from the listing when this edit is
        published.
      </p>
    </div>
  );
}

function RoomRows({
  title,
  addLabel,
  rows,
  onChange,
}: {
  title: string;
  addLabel: string;
  rows: RoomForm[];
  onChange: (next: RoomForm[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>
        {title} {rows.length > 0 ? `(${rows.length})` : ""}
      </span>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">None recorded.</p>
      ) : (
        <div
          aria-hidden="true"
          className="text-muted-foreground hidden grid-cols-[1fr_6rem_6rem_6rem_2.5rem] gap-2 text-xs md:grid"
        >
          <span>Name</span>
          <span>Length (ft)</span>
          <span>Width (ft)</span>
          <span>Area (sq ft)</span>
          <span />
        </div>
      )}
      {rows.map((room, position) => (
        <RoomRow
          key={position}
          title={title}
          position={position}
          room={room}
          onChange={(next) =>
            onChange(rows.map((r, i) => (i === position ? next : r)))
          }
          onRemove={() => onChange(rows.filter((_, i) => i !== position))}
        />
      ))}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([...rows, emptyRoomForm()])}
        >
          <Plus /> {addLabel}
        </Button>
      </div>
    </div>
  );
}

function RoomRow({
  title,
  position,
  room,
  onChange,
  onRemove,
}: {
  title: string;
  position: number;
  room: RoomForm;
  onChange: (next: RoomForm) => void;
  onRemove: () => void;
}) {
  const label = `${title} ${position + 1}`;
  const field = (
    key: keyof RoomForm,
    what: string,
    inputMode: "text" | "decimal",
  ) => (
    <input
      aria-label={`${label} ${what}`}
      className={`${inputClass} h-10`}
      inputMode={inputMode}
      value={room[key]}
      onChange={(e) => onChange({ ...room, [key]: e.target.value })}
    />
  );
  return (
    <div className="grid grid-cols-2 items-center gap-2 md:grid-cols-[1fr_6rem_6rem_6rem_2.5rem]">
      <div className="col-span-2 md:col-span-1">
        {field("name", "name", "text")}
      </div>
      {field("lengthFt", "length (ft)", "decimal")}
      {field("widthFt", "width (ft)", "decimal")}
      {field("areaSqft", "area (sq ft)", "decimal")}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
