import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ocrExtractionJobs } from "@/db/schema/catalog";
import {
  OcrContractError,
  parseOcrRoutingManifest,
  type OcrRoutingManifest,
} from "@/lib/ocr/routing";
import { getSubmissionBrochure } from "./queries";

export const ROUTING_PAGE_CATEGORIES = [
  "project_details",
  "amenities",
  "specifications",
  "floor_plan",
  "ignore",
] as const;

export type RoutingPageCategory = (typeof ROUTING_PAGE_CATEGORIES)[number];

export interface RoutingPageChoice {
  pageNumber: number;
  category: RoutingPageCategory;
}

export class RoutingConfirmationError extends Error {
  constructor(
    public readonly code:
      | "job_not_found"
      | "job_not_draft"
      | "invalid_routing"
      | "routing_unconfirmed",
    message: string,
  ) {
    super(message);
    this.name = "RoutingConfirmationError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readPositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new RoutingConfirmationError(
      "invalid_routing",
      `${path} must be a positive integer.`,
    );
  }
  return value as number;
};

const readCategory = (value: unknown, path: string): RoutingPageCategory => {
  if (!ROUTING_PAGE_CATEGORIES.includes(value as RoutingPageCategory)) {
    throw new RoutingConfirmationError(
      "invalid_routing",
      `${path} is not an approved page category.`,
    );
  }
  return value as RoutingPageCategory;
};

/**
 * Accepts only complete page-level human choices, then creates the one
 * canonical v2 routing manifest. The browser never supplies scope keys or
 * scope objects, so it cannot create a parallel routing shape by accident.
 */
export const buildConfirmedRoutingManifest = (
  input: unknown,
  expectedPageCount: number,
): OcrRoutingManifest => {
  if (!Array.isArray(input)) {
    throw new RoutingConfirmationError(
      "invalid_routing",
      "pages must be an array containing one choice for every brochure page.",
    );
  }
  const choices: RoutingPageChoice[] = input.map((entry, index) => {
    const path = `pages[${index}]`;
    if (!isRecord(entry)) {
      throw new RoutingConfirmationError(
        "invalid_routing",
        `${path} must be an object.`,
      );
    }
    return {
      pageNumber: readPositiveInteger(entry.pageNumber, `${path}.pageNumber`),
      category: readCategory(entry.category, `${path}.category`),
    };
  });

  if (choices.length !== expectedPageCount) {
    throw new RoutingConfirmationError(
      "invalid_routing",
      `Every one of the ${expectedPageCount} brochure pages must be categorized or ignored.`,
    );
  }

  const choicesByPage = new Map<number, RoutingPageChoice>();
  for (const choice of choices) {
    if (choice.pageNumber > expectedPageCount) {
      throw new RoutingConfirmationError(
        "invalid_routing",
        `Page ${choice.pageNumber} does not exist in this brochure.`,
      );
    }
    if (choicesByPage.has(choice.pageNumber)) {
      throw new RoutingConfirmationError(
        "invalid_routing",
        `Page ${choice.pageNumber} was categorized more than once.`,
      );
    }
    choicesByPage.set(choice.pageNumber, choice);
  }
  for (let pageNumber = 1; pageNumber <= expectedPageCount; pageNumber += 1) {
    if (!choicesByPage.has(pageNumber)) {
      throw new RoutingConfirmationError(
        "invalid_routing",
        `Page ${pageNumber} still needs a category or an explicit ignore.`,
      );
    }
  }

  const pagesFor = (category: RoutingPageCategory) =>
    choices
      .filter((choice) => choice.category === category)
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((choice) => ({ pageNumber: choice.pageNumber }));

  // A page can only be given one category, but a project overview or a site plan
  // often names the amenities too (the 360 brochure prints them as labels on its
  // site plan). So the amenities step reads the amenity pages and the
  // project-details pages: an amenity on either is not lost, and a page that
  // states none simply yields none.
  const amenityPages = [
    ...pagesFor("amenities"),
    ...pagesFor("project_details"),
  ]
    .filter(
      (page, index, all) =>
        all.findIndex((other) => other.pageNumber === page.pageNumber) ===
        index,
    )
    .sort((left, right) => left.pageNumber - right.pageNumber);

  const scopes = [
    ...(pagesFor("project_details").length === 0
      ? []
      : [
          {
            scopeKey: "project-details",
            kind: "property_details" as const,
            label: "Project details",
            pages: pagesFor("project_details"),
          },
        ]),
    ...(amenityPages.length === 0
      ? []
      : [
          {
            scopeKey: "amenities",
            kind: "amenities" as const,
            label: "Amenities",
            pages: amenityPages,
          },
        ]),
    ...(pagesFor("specifications").length === 0
      ? []
      : [
          {
            scopeKey: "specifications",
            kind: "specifications" as const,
            label: "Specifications",
            pages: pagesFor("specifications"),
          },
        ]),
    ...(pagesFor("floor_plan").length === 0
      ? []
      : [
          {
            scopeKey: "floor-plans",
            kind: "floor_plans" as const,
            label: "Confirmed floor plans",
            pages: pagesFor("floor_plan"),
          },
        ]),
    ...(pagesFor("ignore").length === 0
      ? []
      : [
          {
            scopeKey: "ignored",
            kind: "ignore" as const,
            label: "Not selected for extraction",
            pages: pagesFor("ignore"),
          },
        ]),
  ];

  try {
    return parseOcrRoutingManifest(
      { version: "v2", pageCount: expectedPageCount, scopes },
      expectedPageCount,
    );
  } catch (cause) {
    const message =
      cause instanceof OcrContractError
        ? cause.message
        : "The confirmed pages could not be validated.";
    throw new RoutingConfirmationError("invalid_routing", message);
  }
};

export const saveConfirmedRouting = async (
  database: PostgresJsDatabase,
  input: { ocrJobId: string; pages: unknown },
): Promise<OcrRoutingManifest> => {
  const brochure = await getSubmissionBrochure(database, input.ocrJobId, "job");
  if (!brochure) {
    throw new RoutingConfirmationError(
      "job_not_found",
      "No such brochure attempt.",
    );
  }
  if (brochure.ocrJobStatus !== "draft") {
    throw new RoutingConfirmationError(
      "job_not_draft",
      "Page routing can only be changed while the OCR attempt is a draft.",
    );
  }
  const manifest = buildConfirmedRoutingManifest(
    input.pages,
    brochure.pageCount,
  );
  const updated = await database
    .update(ocrExtractionJobs)
    .set({ routingManifest: manifest })
    .where(
      and(
        eq(ocrExtractionJobs.id, brochure.ocrJobId),
        eq(ocrExtractionJobs.status, "draft"),
      ),
    )
    .returning({ id: ocrExtractionJobs.id });
  if (updated.length === 0) {
    throw new RoutingConfirmationError(
      "job_not_draft",
      "The OCR attempt changed before its routing could be saved. Refresh and try again.",
    );
  }
  return manifest;
};

/**
 * Freezes a complete human-confirmed manifest for the existing extraction
 * worker. This makes no provider request: the worker is the only code that
 * later turns a queued attempt into a paid Claude call.
 */
export const queueConfirmedOcr = async (
  database: PostgresJsDatabase,
  ocrJobId: string,
): Promise<void> => {
  const brochure = await getSubmissionBrochure(database, ocrJobId, "job");
  if (!brochure) {
    throw new RoutingConfirmationError(
      "job_not_found",
      "No such brochure attempt.",
    );
  }
  if (brochure.ocrJobStatus !== "draft") {
    throw new RoutingConfirmationError(
      "job_not_draft",
      "Only a draft OCR attempt can be queued.",
    );
  }
  try {
    parseOcrRoutingManifest(brochure.routingManifest, brochure.pageCount);
  } catch (cause) {
    const message =
      cause instanceof OcrContractError
        ? cause.message
        : "The confirmed routing could not be validated.";
    throw new RoutingConfirmationError("routing_unconfirmed", message);
  }
  const updated = await database
    .update(ocrExtractionJobs)
    .set({ status: "queued" })
    .where(
      and(
        eq(ocrExtractionJobs.id, brochure.ocrJobId),
        eq(ocrExtractionJobs.status, "draft"),
      ),
    )
    .returning({ id: ocrExtractionJobs.id });
  if (updated.length === 0) {
    throw new RoutingConfirmationError(
      "job_not_draft",
      "The OCR attempt changed before it could be queued. Refresh and try again.",
    );
  }
};
