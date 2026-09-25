import { BuyerLoginForm } from "@/components/auth/buyer-login-form";
import {
  AREA_BASIS_LABEL,
  AREA_BASIS_ORDER,
  groupByCategory,
  humaniseCategory,
  shortUnitTypeName,
} from "@/lib/properties/dossier";
import type { DossierLock, DossierUnitVariant } from "@/lib/properties/types";
import { LockedBar, LockedTile } from "./locked-skeleton";
import { BodyText, DisplayHeading, Eyebrow } from "./typography";

/**
 * What a signed-out visitor sees where the dossier's gated detail would be
 * (`DECISIONS.md` 2026-09-24, widened 2026-09-25): everything below the top of the
 * page, from the configurations' measurements to the developer's details, the
 * floor plans and all but the first few photographs. The section, the names of things and the
 * shape of the content are all there; the values are shimmering bars. The values
 * themselves were never sent (`lockDossier`), so this is a picture of the layout,
 * not a blur over real data.
 */

/** Where every "sign in to see" link points. */
export const UNLOCK_ID = "unlock";

const UNLOCK_LINK =
  "text-primary w-fit text-sm underline underline-offset-4 hover:no-underline";

/** The one sign-in prompt on a locked dossier: a phone number, no email or password. */
export function UnlockPrompt({
  slug,
  lock,
}: {
  slug: string;
  lock: DossierLock;
}) {
  const hidden = [
    "the unit types with their areas and room sizes",
    "the amenities and specifications",
    "the location and what is nearby",
    "the RERA record",
    lock.hiddenFloorPlans > 0 ? "the floor plans" : null,
    lock.hiddenPhotos > 0
      ? `all ${lock.hiddenPhotos} more ${lock.hiddenPhotos === 1 ? "photo" : "photos"}`
      : null,
  ].filter((item): item is string => item !== null);
  return (
    <section
      id={UNLOCK_ID}
      data-slot="dossier-unlock"
      className="border-border bg-tone-sage grid scroll-mt-24 gap-6 rounded-lg border p-6 md:grid-cols-2 md:p-8"
    >
      <div className="flex flex-col gap-2">
        <DisplayHeading level={2} className="text-3xl">
          Sign in to see the full record
        </DisplayHeading>
        <BodyText className="text-muted-foreground text-sm">
          Signing in with your phone number opens{" "}
          {hidden.slice(0, -1).join(", ")}
          {hidden.length > 1 ? " and " : ""}
          {hidden[hidden.length - 1]}. No email, no password.
        </BodyText>
      </div>
      <div className="max-w-sm">
        <BuyerLoginForm returnTo={`/properties/${slug}`} />
      </div>
    </section>
  );
}

const AREA_ROW_COUNT = AREA_BASIS_ORDER.length;

/** The unit types: their names and BHK are open, every measurement is a bar. */
export function LockedConfigurations({
  variants,
}: {
  variants: DossierUnitVariant[];
}) {
  const [shown, ...others] = variants;
  return (
    <div
      data-slot="locked-configurations"
      className="border-border bg-card flex flex-col gap-5 rounded-lg border p-6"
    >
      {others.length > 0 ? (
        <ul
          aria-label="Unit types"
          className="border-border flex flex-wrap gap-2 border-b pb-5"
        >
          {variants.map((variant, index) => (
            <li
              key={variant.id}
              title={variant.variantName}
              className={
                index === 0
                  ? "border-primary bg-card max-w-full truncate rounded-md border px-3 py-1.5 text-sm"
                  : "border-border text-muted-foreground max-w-full truncate rounded-md border px-3 py-1.5 text-sm"
              }
            >
              {shortUnitTypeName(variant.variantName)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-1">
        <DisplayHeading level={3}>{shown.variantName}</DisplayHeading>
        {shown.bhkType ? (
          <p className="text-muted-foreground text-sm">{shown.bhkType.label}</p>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          "Layout",
          "Units of this type",
          ...AREA_BASIS_ORDER.map((basis) => AREA_BASIS_LABEL[basis]),
        ].map((label, index) => (
          <div key={label} className="flex flex-col gap-2">
            <dt>
              <Eyebrow>{label}</Eyebrow>
            </dt>
            <dd className="py-1">
              <LockedBar index={index} className="h-5" />
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <Eyebrow>Room dimensions</Eyebrow>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="border-border flex items-center justify-between gap-4 border-b pb-2"
            >
              <LockedBar index={AREA_ROW_COUNT + 2 + index} className="w-1/3" />
              <LockedBar index={AREA_ROW_COUNT + 3 + index} className="w-1/4" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Eyebrow>Private amenities</Eyebrow>
        <LockedBar index={AREA_ROW_COUNT + 8} className="h-5 w-1/2" />
      </div>
      <a href={`#${UNLOCK_ID}`} className={UNLOCK_LINK}>
        Sign in to see the configurations
      </a>
    </div>
  );
}

/** The catalog's amenity names by category, each with a bar where its answer goes. */
export function LockedAmenities({
  catalog,
}: {
  catalog: DossierLock["amenityCatalog"];
}) {
  return (
    <LockedCatalog
      catalog={catalog}
      slot="locked-amenities"
      noun="amenities we check for"
      unlock="Sign in to see which amenities this property offers"
    />
  );
}

/** The same, for the specifications. */
export function LockedSpecifications({
  catalog,
}: {
  catalog: DossierLock["specificationCatalog"];
}) {
  return (
    <LockedCatalog
      catalog={catalog}
      slot="locked-specifications"
      noun="specifications we record"
      unlock="Sign in to see how this property is built and finished"
    />
  );
}

/**
 * Named facts with a bar where each value goes (location, RERA, developer): the
 * name of a fact is not the fact.
 */
export function LockedFacts({
  labels,
  slot,
  unlock,
}: {
  labels: string[];
  slot: string;
  unlock: string;
}) {
  return (
    <div data-slot={slot} className="flex flex-col gap-5">
      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {labels.map((label, index) => (
          <div key={label} className="flex flex-col gap-2">
            <dt>
              <Eyebrow>{label}</Eyebrow>
            </dt>
            <dd className="py-1">
              <LockedBar index={index} className="h-5" />
            </dd>
          </div>
        ))}
      </dl>
      <a href={`#${UNLOCK_ID}`} className={UNLOCK_LINK}>
        {unlock}
      </a>
    </div>
  );
}

function LockedCatalog({
  catalog,
  slot,
  noun,
  unlock,
}: {
  catalog: { label: string; category: string }[];
  slot: string;
  noun: string;
  unlock: string;
}) {
  const SHOWN = 12;
  const shown = catalog.slice(0, SHOWN);
  const more = catalog.length - shown.length;
  return (
    <div data-slot={slot} className="flex flex-col gap-6">
      {groupByCategory(shown).map((group) => (
        <div key={group.category} className="flex flex-col gap-2">
          <Eyebrow>{humaniseCategory(group.category)}</Eyebrow>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {group.items.map((item) => (
              <div
                key={item.label}
                className="border-border flex items-center justify-between gap-4 border-b pb-1"
              >
                <dt className="text-muted-foreground text-sm">{item.label}</dt>
                <dd className="w-1/4">
                  <LockedBar index={shown.indexOf(item)} className="w-full" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {more > 0 ? (
        <p className="text-muted-foreground text-sm">
          and {more} more {noun}.
        </p>
      ) : null}
      <a href={`#${UNLOCK_ID}`} className={UNLOCK_LINK}>
        {unlock}
      </a>
    </div>
  );
}

/** The photographs and floor plans beyond the preview, as tiles in the same wave. */
export function LockedMedia({ lock }: { lock: DossierLock }) {
  if (lock.hiddenPhotos === 0 && lock.hiddenFloorPlans === 0) return null;
  const tiles = Math.min(lock.hiddenPhotos + lock.hiddenFloorPlans, 4);
  const parts = [
    lock.hiddenPhotos > 0
      ? `${lock.hiddenPhotos} more ${lock.hiddenPhotos === 1 ? "photo" : "photos"}`
      : null,
    lock.hiddenFloorPlans > 0
      ? `${lock.hiddenFloorPlans} ${lock.hiddenFloorPlans === 1 ? "floor plan" : "floor plans"}`
      : null,
  ].filter((part): part is string => part !== null);
  return (
    <div data-slot="locked-media" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: tiles }, (_, index) => (
          <LockedTile key={index} index={index * 2} />
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        {parts.join(" and ")}.{" "}
        <a href={`#${UNLOCK_ID}`} className={UNLOCK_LINK}>
          Sign in to see them
        </a>
      </p>
    </div>
  );
}
