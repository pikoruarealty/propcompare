import { groupCarpetAreas, type FlatCarpetArea } from "./carpet-area";
import { legacyTlsFetch } from "./legacy-tls-fetch";
import { towerCountOfBlocks, towerFloorsOf } from "./towers";
import {
  RegulatorError,
  type RegulatorAdapter,
  type RegulatorBlockProgress,
  type RegulatorDetails,
  type RegulatorParty,
  type RegulatorPromoterHistory,
  type RegulatorPoint,
  type RegulatorPriceRange,
  type RegulatorQuarter,
  type RegulatorRecord,
} from "./types";

/**
 * GujRERA (Gujarat Real Estate Regulatory Authority), read through the same public
 * JSON endpoints its own public pages use. No login, captcha or credentials are
 * involved. Confirmed by hand on 2026-09-20 against The Kimana Towers; the site is
 * an Angular app, so these endpoints are what a person's browser calls, not a
 * documented API — expect to adjust when the site changes, and let the tests that
 * replay saved responses say what broke.
 *
 * Two hard rules apply here:
 *  - Money never enters the record or any public table. The search result carries
 *    min/max project cost, the detail carries land and construction cost, and the
 *    form-three inventory lists a price for every unit (masked as "******" in the
 *    public list, checked 2026-09-24). This adapter reads only the named fields it
 *    needs and never stores a raw response. The one exception is the project's
 *    minimum and maximum cost, read by `lookupPriceRange` alone and handed to the
 *    private schema (`DECISIONS.md` 2026-09-24, "price data").
 *  - The per-flat list carries a price, a buyer's name and a mobile number for every
 *    flat. Only the flat number, carpet area and usage are read from it, and only
 *    the distinct carpet areas per block are kept, never a per-flat row.
 *  - Requests are polite: one at a time, a short pause between them, a timeout, and
 *    a plain user agent.
 */
const ORIGIN = "https://gujrera.gujarat.gov.in";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GujreraAdapterOptions {
  fetchImpl?: FetchLike;
  /** Pause between requests, in milliseconds. */
  delayMs?: number;
  timeoutMs?: number;
  now?: () => Date;
}

const REGISTRATION_PREFIX = /^PR\/GJ\//;

const normaliseNumber = (input: string): string =>
  input.trim().replace(/\s+/g, " ").toUpperCase();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** GujRERA prints dates as "2022-06-21T00:00:00.000+0530"; the calendar date is
 * the part before the "T", already in India time. */
const isoDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  return match ? match[1] : null;
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const positive = (value: unknown): number | null => {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
};

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : undefined;

export const createGujreraAdapter = (
  options: GujreraAdapterOptions = {},
): RegulatorAdapter => {
  // GujRERA's TLS server needs the legacy-renegotiation transport; see that module.
  const fetchImpl: FetchLike = options.fetchImpl ?? legacyTlsFetch;
  const delayMs = options.delayMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const now = options.now ?? (() => new Date());

  const request = async (
    path: string,
    init?: { body?: unknown },
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${ORIGIN}${path}`, {
        method: init?.body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          "User-Agent": "PropCompare-RERA-Check/1.0",
          ...(init?.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new RegulatorError(
        "unavailable",
        "GujRERA did not answer. Try again in a few minutes.",
      );
    }
    if (!response.ok) {
      throw new RegulatorError(
        "unavailable",
        `GujRERA answered with an error (${response.status}). Try again in a few minutes.`,
      );
    }
    const raw = await response.text();
    try {
      return JSON.parse(raw);
    } catch {
      throw new RegulatorError(
        "unexpected_response",
        "GujRERA returned something we could not read.",
      );
    }
  };

  /** A piece that is nice to have: a failure is recorded as a gap, not an error. */
  const optional = async (
    gaps: string[],
    label: string,
    path: string,
  ): Promise<unknown> => {
    await sleep(delayMs);
    try {
      return await request(path);
    } catch {
      gaps.push(label);
      return null;
    }
  };

  /** Distinct carpet areas per block from the per-flat list. A failure or an empty
   * list is a recorded gap, never "no carpet areas". */
  const readCarpetGroups = async (
    formThreeId: string,
    blocks: RegulatorRecord["blocks"],
    gaps: string[],
  ) => {
    if (!/^\d{1,12}$/.test(formThreeId) || blocks.length === 0) {
      gaps.push("flat carpet areas");
      return { groups: [], asOn: null };
    }
    const flats: FlatCarpetArea[] = [];
    let failed = false;
    let asOn: string | null = null;
    // Every residential flat's number and block, for towers and units per floor
    // (the number alone: nothing else of the row).
    const numbered: { block: string; flatNumber: string }[] = [];
    for (const block of blocks) {
      await sleep(delayMs);
      try {
        const body = asRecord(
          await request("/formthree/public/get-inv-details-for-view", {
            body: { blockName: block.name, formThreeId: Number(formThreeId) },
          }),
        );
        for (const row of Array.isArray(body?.data) ? body.data : []) {
          const flat = asRecord(row);
          const flatNumber = text(flat?.flatNo);
          const carpetAreaSqm = positive(flat?.carpetArea);
          const usage = text(flat?.usage);
          if (flatNumber && (usage === null || /resid/i.test(usage))) {
            numbered.push({ block: block.name, flatNumber });
          }
          if (!flatNumber || carpetAreaSqm === null) continue;
          // A flat is at least a few square metres and never a hectare.
          if (carpetAreaSqm < 1 || carpetAreaSqm > 5000) continue;
          if (usage !== null && !/resid/i.test(usage)) continue;
          // Only the booked or unbooked word and the exclusive area are taken from
          // the rest of the row: it also holds a price, a buyer and a phone number.
          const status = text(flat?.status)?.toUpperCase();
          const exclusive = positive(flat?.areaofExBalcony);
          flats.push({
            flatNumber,
            carpetAreaSqm,
            ...(status === "BOOKED" || status === "UNBOOKED"
              ? { booked: status === "BOOKED" }
              : {}),
            ...(exclusive !== null && exclusive < 500
              ? { exclusiveAreaSqm: exclusive }
              : {}),
          });
          const listedOn = isoDate(flat?.createdOn);
          if (listedOn !== null && (asOn === null || listedOn > asOn)) {
            asOn = listedOn;
          }
        }
      } catch {
        failed = true;
      }
    }
    if (failed || flats.length === 0) gaps.push("flat carpet areas");
    return {
      groups: groupCarpetAreas(flats),
      asOn,
      // Only from a complete list: a block that failed would undercount.
      towers: failed ? null : towerFloorsOf(numbered),
    };
  };

  /** The search hit for exactly this registration number, or a `RegulatorError`. */
  const findHit = async (
    registrationNumber: string,
  ): Promise<Record<string, unknown>> => {
    const number = normaliseNumber(registrationNumber);
    if (
      !REGISTRATION_PREFIX.test(number) ||
      number.length > 200 ||
      !/^[A-Z0-9/ .()&-]+$/.test(number)
    ) {
      throw new RegulatorError(
        "invalid_number",
        "That does not look like a Gujarat RERA registration number (it starts PR/GJ/).",
      );
    }
    const search = asRecord(
      await request("/project_reg/public/global-search", {
        body: { query: number, startWith: 0, dataSize: 10 },
      }),
    );
    const hits = (Array.isArray(search?.data) ? search.data : [])
      .map(asRecord)
      .filter(
        (hit): hit is Record<string, unknown> =>
          hit !== null &&
          hit.entityType === "PROJECT" &&
          typeof hit.regNo === "string" &&
          normaliseNumber(hit.regNo) === number,
      );
    if (hits.length === 0) {
      throw new RegulatorError(
        "not_found",
        "GujRERA has no registered project with that number. Check it and try again.",
      );
    }
    if (hits.length > 1) {
      throw new RegulatorError(
        "ambiguous",
        "GujRERA lists more than one project under that number.",
      );
    }
    return hits[0];
  };

  return {
    code: "gujrera",
    label: "GujRERA",

    async lookupPriceRange(
      registrationNumber,
    ): Promise<RegulatorPriceRange | null> {
      const hit = await findHit(registrationNumber);
      const minInr = positive(hit.mincost);
      const maxInr = positive(hit.maxcost);
      // A range that is missing, zero or upside down is not a range we can use.
      if (minInr === null || maxInr === null || minInr > maxInr) return null;
      return { minInr: Math.round(minInr), maxInr: Math.round(maxInr) };
    },

    ownsRegistrationNumber: (registrationNumber) =>
      REGISTRATION_PREFIX.test(normaliseNumber(registrationNumber)),

    async lookupByRegistrationNumber(registrationNumber) {
      const number = normaliseNumber(registrationNumber);
      if (
        !REGISTRATION_PREFIX.test(number) ||
        number.length > 200 ||
        !/^[A-Z0-9/ .()&-]+$/.test(number)
      ) {
        throw new RegulatorError(
          "invalid_number",
          "That does not look like a Gujarat RERA registration number (it starts PR/GJ/).",
        );
      }

      // 1. Find the project. The full number must match exactly; a near match is
      // not accepted because it would attach the wrong project's facts.
      const search = asRecord(
        await request("/project_reg/public/global-search", {
          body: { query: number, startWith: 0, dataSize: 10 },
        }),
      );
      const hits = (Array.isArray(search?.data) ? search.data : [])
        .map(asRecord)
        .filter(
          (hit): hit is Record<string, unknown> =>
            hit !== null &&
            hit.entityType === "PROJECT" &&
            typeof hit.regNo === "string" &&
            normaliseNumber(hit.regNo) === number,
        );
      if (hits.length === 0) {
        throw new RegulatorError(
          "not_found",
          "GujRERA has no registered project with that number. Check it and try again.",
        );
      }
      if (hits.length > 1) {
        throw new RegulatorError(
          "ambiguous",
          "GujRERA lists more than one project under that number.",
        );
      }
      const hit = hits[0];
      const projectId = String(hit.entityId ?? "");
      if (!/^\d{1,12}$/.test(projectId)) {
        throw new RegulatorError(
          "unexpected_response",
          "GujRERA returned a project we could not identify.",
        );
      }

      // 2. The registration detail. Required: without it there is nothing to
      // compare.
      await sleep(delayMs);
      const detail = asRecord(
        asRecord(
          await request(`/project_reg/public/getproject-details/${projectId}`),
        )?.data,
      );
      const project = asRecord(detail?.projectDetail);
      if (!project) {
        throw new RegulatorError(
          "unexpected_response",
          "GujRERA returned no registration detail for that project.",
        );
      }

      // 3. Everything else is optional; a missing piece is reported, not fatal.
      const gaps: string[] = [];

      const summary = asRecord(
        asRecord(
          await optional(
            gaps,
            "promoter",
            `/project_reg/public/alldatabyprojectid/${projectId}`,
          ),
        )?.data,
      );

      // The promoter's own record, for the group's stated history. Only the three
      // figures are read; the record also holds contact details, which are not.
      const promoterId = /^\d{1,12}$/.test(String(summary?.promoterId ?? ""))
        ? String(summary?.promoterId)
        : null;
      const promoterRecord =
        promoterId === null
          ? null
          : asRecord(
              await optional(
                gaps,
                "promoter history",
                `/user_reg/promoter/promoter${promoterId}`,
              ),
            );

      // The latest quarterly filing: the form ids the site's own summary and
      // inventory tabs read. The registration summary's ids can be a later draft
      // than the filing the site shows, so these take precedence.
      const latestIds = asRecord(
        asRecord(
          await optional(
            gaps,
            "latest filing",
            `/quarter/public/get-qtr-form-details/${projectId}`,
          ),
        )?.data,
      );
      const idOf = (value: unknown): string | null => {
        const id = String(value ?? "");
        return /^\d{1,12}$/.test(id) ? id : null;
      };
      const filingFormOneId = idOf(latestIds?.formOneId);
      const formThreeId =
        idOf(latestIds?.formThreeId) ?? idOf(summary?.formThreeId) ?? "";

      // Progress: the latest filing's figure, else the older certified one.
      const readFormOne = async (id: string, label: string) =>
        asRecord(
          asRecord(
            await optional(
              gaps,
              label,
              `/formone/public/getfrom-one-byformone-id/${id}`,
            ),
          )?.data,
        );
      const percent = (value: unknown): number | null => {
        const number = finiteNumber(value);
        return number !== null && number >= 0 && number <= 100 ? number : null;
      };
      // Only a form-one the quarterly listing named counts as the latest filing;
      // the registration's own form-one is the older certified one.
      const filingForm = filingFormOneId
        ? await readFormOne(filingFormOneId, "latest filing progress")
        : null;
      const filingProgress = percent(filingForm?.progressReport);

      const progressBody = asRecord(
        await optional(
          gaps,
          "construction progress",
          `/formone/public/getfrom-one-progs-rept-projectid/${projectId}`,
        ),
      );
      const certifiedProgress = percent(progressBody?.data);
      const constructionProgressPercent = filingProgress ?? certifiedProgress;
      const progressSource: RegulatorDetails["filing"]["source"] =
        filingProgress !== null
          ? "quarterly_filing"
          : certifiedProgress !== null
            ? "certified_form_one"
            : null;
      if (constructionProgressPercent === null) {
        if (!gaps.includes("construction progress")) {
          gaps.push("construction progress");
        }
      } else {
        // One good figure is enough: a failed second source is not a gap.
        const index = gaps.indexOf("construction progress");
        if (index >= 0) gaps.splice(index, 1);
      }

      let totalUnits: number | null = null;
      let bookedUnits: number | null = null;
      let availableUnits: number | null = null;
      if (formThreeId !== "") {
        const inventory = asRecord(
          await optional(
            gaps,
            "unit count",
            `/formthree/public/get-fromthree-a-details-byid/${formThreeId}`,
          ),
        );
        const count = (value: unknown): number | null => {
          const number = finiteNumber(value);
          return number !== null && Number.isInteger(number) && number >= 0
            ? number
            : null;
        };
        const units = count(inventory?.numberOfUnits);
        totalUnits = units !== null && units > 0 ? units : null;
        bookedUnits = count(inventory?.bookedUnit);
        availableUnits = count(inventory?.unBookedUnit);
        if (totalUnits === null && !gaps.includes("unit count")) {
          gaps.push("unit count");
        }
      } else if (summary) {
        gaps.push("unit count");
      }

      // Blocks, with the progress, floors and lifts the filing states for each. The
      // filing's own list is used; the registration's form-one only when the
      // filing could not be read.
      const readBlocks = (form: Record<string, unknown> | null) => {
        const list = form?.formOneAList;
        return (Array.isArray(list) ? list : []).flatMap(
          (entry): RegulatorBlockProgress[] => {
            const block = asRecord(entry);
            const name = text(block?.blockName);
            if (!name) return [];
            const whole = (value: unknown): number | null => {
              const number = Number(value);
              return Number.isInteger(number) && number > 0 ? number : null;
            };
            return [
              {
                name,
                progressPercent: percent(block?.blockProgress),
                floors: whole(block?.noOfFloors),
                lifts: whole(block?.noOfLifts),
                slabs: whole(block?.totalNoOfSlabs),
              },
            ];
          },
        );
      };
      let blockProgress = readBlocks(filingForm);
      if (blockProgress.length === 0) {
        const registrationFormOneId = idOf(summary?.formOneId);
        if (registrationFormOneId) {
          blockProgress = readBlocks(
            await readFormOne(registrationFormOneId, "blocks"),
          );
        } else if (summary) {
          gaps.push("blocks");
        }
      }
      const blocks: RegulatorRecord["blocks"] = blockProgress.map((block) => ({
        name: block.name,
        slabs: block.slabs,
      }));

      // Carpet area of every flat, in square metres, reduced to the distinct areas
      // per block, with how many are booked. Read from the same list the site's
      // own inventory tab shows; only the named fields are taken.
      const {
        groups: carpetGroups,
        asOn: inventoryAsOn,
        towers,
      } = await readCarpetGroups(formThreeId, blocks, gaps);

      const developments = Array.isArray(detail?.dev) ? detail.dev : [];
      const amenityFlags = readAmenityFlags(
        developments,
        asRecord(filingForm?.formOneB),
      );

      const quarters = asRecord(
        await optional(
          gaps,
          "quarterly filings",
          `/quarter/public/getprojectqtrs/${projectId}`,
        ),
      );

      // The drawn project boundary. The response also carries a project cost;
      // only the coordinates are read.
      const boundary = parseBoundary(
        asRecord(
          await optional(
            gaps,
            "boundary",
            `/maplocation/public/getProjectLocations/${projectId}`,
          ),
        )?.coordinates,
      );
      if (boundary.length === 0 && !gaps.includes("boundary")) {
        gaps.push("boundary");
      }

      const filingRows = Array.isArray(quarters?.data) ? quarters.data : [];
      const listedFilings = filingRows.filter(
        (row) => text(asRecord(row)?.quarterName) !== null,
      );
      const filings =
        listedFilings.length > 0
          ? {
              listed: listedFilings.length,
              submitted: listedFilings.filter(
                (row) => text(asRecord(row)?.status) === "SUBMITTED",
              ).length,
            }
          : null;
      const latest = latestQuarter(quarters?.data);

      const openArea = positive(project.totOpenArea);
      const coveredArea = positive(project.totCoverdArea);
      const details: RegulatorDetails = {
        version: 1,
        layoutLandAreaSqm: positive(project.totAreaOfLandLayout),
        openAreaSqm: openArea,
        coveredAreaSqm: coveredArea,
        coveredParkingAreaSqm: positive(project.coveredParkingArea),
        coveredParkingSlots: positive(project.coveredParking),
        // From the flats listed, so it is the range the site's summary prints.
        carpetAreaRangeSqm:
          carpetGroups.length > 0
            ? {
                min: Math.min(...carpetGroups.map((g) => g.carpetAreaSqm)),
                max: Math.max(...carpetGroups.map((g) => g.carpetAreaSqm)),
              }
            : null,
        filing: {
          quarter: filingProgress !== null ? (latest?.name ?? null) : null,
          periodEndsOn:
            filingProgress !== null ? (latest?.periodEndsOn ?? null) : null,
          source: progressSource,
          progressPercent: constructionProgressPercent,
          blocks: blockProgress,
        },
        inventory:
          totalUnits === null && bookedUnits === null
            ? null
            : {
                totalUnits,
                bookedUnits,
                availableUnits,
                asOn: inventoryAsOn,
              },
        filings,
        planPassingAuthority: text(project.approvingAuthority),
        registeredOn: dayMonthYear(summary?.approvedDate),
        architects: parties(
          detail?.acrchlist,
          "name",
          "noOfKeyProjectCompleted",
        ),
        engineers: parties(detail?.englist, "name", "noOfKeyProjectsCompleted"),
        contractors: parties(
          detail?.contr,
          "contractortName",
          "noofkeyprojectscompleted",
        ),
        boundary,
        centre: boundaryCentre(boundary),
        promoter: promoterHistory(promoterRecord),
        towers,
        towerCount: towerCountOfBlocks(blocks.map((block) => block.name)),
      };

      return {
        regulatorCode: "gujrera",
        registrationNumber: text(hit.regNo) ?? number,
        externalProjectId: projectId,
        projectName: text(project.projectName) ?? text(hit.entityName) ?? "",
        promoterName: text(summary?.promoterName),
        promoterType: text(summary?.promoterType),
        projectType: text(project.projectType),
        registeredFrom: isoDate(project.startDate),
        completionDate: isoDate(project.completionDate),
        district: text(project.distName) ?? text(hit.distName),
        address:
          [text(project.projectAddress), text(project.projectAddress2)]
            .filter((part): part is string => part !== null)
            .join(", ") || null,
        totalUnits,
        constructionProgressPercent,
        projectDescription: text(project.projectDesc),
        pincode: text(project.pinCode),
        // The figure the site prints as the project's land area (its layout land),
        // then the registered-for-RERA part, then the whole plot.
        landAreaSqm: positive(
          project.totAreaOfLandLayout ??
            project.totLandAreaForProjectUnderReg ??
            project.totAreaOfLand,
        ),
        coveredParkingSlots: positive(project.coveredParking),
        blocks,
        carpetGroups,
        details,
        declaredAmenityKeys: amenityFlags.declared,
        notProposedAmenityKeys: amenityFlags.notProposed,
        latestQuarter: latest,
        sourceUrl: `${ORIGIN}/#/search-glob/gloabl-data`,
        fetchedAt: now().toISOString(),
        gaps,
      } satisfies RegulatorRecord;
    },
  };
};

/** A count or a number of years the promoter's record prints as text ("11"). */
const wholeCount = (value: unknown): number | null => {
  const raw = typeof value === "number" ? String(value) : text(value);
  if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
  return Number(raw);
};

/** The group's stated history from the promoter's record; null when it states none
 * of the three (or the record could not be read). */
export const promoterHistory = (
  record: Record<string, unknown> | null,
): RegulatorPromoterHistory | null => {
  if (!record) return null;
  const history = {
    yearsInGujarat: wholeCount(record.entities_experienceInState),
    completedProjects: wholeCount(record.entities_noOfProjectsCompleted),
    ongoingProjects: wholeCount(record.entities_ongoingProjects),
  };
  return Object.values(history).some((value) => value !== null)
    ? history
    : null;
};

const yesNo = (value: unknown): "yes" | "no" | null => {
  const word = typeof value === "string" ? value.trim().toUpperCase() : "";
  return word === "YES" ? "yes" : word === "NO" ? "no" : null;
};

/**
 * What the regulator's flags say about the amenities we catalogue. The brochure is
 * the primary source (owner decision, 2026-09-24), so this is deliberately
 * lopsided:
 * - A "yes" adds an amenity only where the regulator's item is the same thing as a
 *   catalogue amenity: a swimming pool, and landscaping (the site prints it as
 *   "Garden"). Other items (community buildings, security, fire protection, water
 *   conservation, renewable energy) are not the same as any one catalogue amenity,
 *   so a "yes" to them adds nothing.
 * - A "no" never changes the listing. It is kept as `notProposed`, only to prompt a
 *   check of a brochure claim, because a "no" may mean "not in this filing". A
 *   community buildings "no" points at the clubhouse and halls, the things such a
 *   building would be.
 * A flag that is blank or reads anything else says nothing.
 */
export const readAmenityFlags = (
  developments: unknown[],
  formOneB: Record<string, unknown> | null,
): { declared: string[]; notProposed: string[] } => {
  const declared = new Set<string>();
  const notProposed = new Set<string>();
  const note = (
    answer: "yes" | "no" | null,
    keys: string[],
    addOnYes = true,
  ) => {
    if (answer === "yes" && addOnYes) keys.forEach((key) => declared.add(key));
    if (answer === "no") keys.forEach((key) => notProposed.add(key));
  };

  const pool = developments
    .map((entry) => yesNo(asRecord(entry)?.sewSwimCapacityFlag))
    .filter((answer) => answer !== null);
  note(pool.includes("yes") ? "yes" : pool.includes("no") ? "no" : null, [
    "swimming_pool",
  ]);
  note(yesNo(formOneB?.landscapingYesNo), ["landscaped_garden"]);
  note(
    yesNo(formOneB?.communityBuildingsYesNo),
    ["clubhouse", "multipurpose_hall", "banquet_hall"],
    false,
  );
  return { declared: [...declared], notProposed: [...notProposed] };
};

/** "11-11-2022" (day-month-year, as the summary prints an approval date) to ISO. */
const dayMonthYear = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day)
    ? null
    : `${year}-${month}-${day}`;
};

/** India's bounding box: a coordinate outside it is a typo, not a place. */
const inIndia = (lat: number, lng: number): boolean =>
  lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;

/**
 * The drawn boundary from the map service: `{ lat, lang }` pairs as text, the first
 * point often repeated at the end to close the ring. Points outside India, or that
 * do not read as numbers, are dropped; fewer than three left is no boundary.
 */
export const parseBoundary = (coordinates: unknown): RegulatorPoint[] => {
  const points: RegulatorPoint[] = [];
  for (const entry of Array.isArray(coordinates) ? coordinates : []) {
    const item = asRecord(entry);
    const lat = Number(item?.lat);
    const lng = Number(item?.lang ?? item?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!inIndia(lat, lng)) continue;
    points.push({ lat, lng });
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first.lat === last.lat && first.lng === last.lng) {
    points.pop();
  }
  return points.length >= 3 ? points : [];
};

/** The centre of a boundary: the area-weighted centroid of the ring, or the mean
 * of its corners when the ring has no area. A project is a few hundred metres
 * across, so plain degrees are accurate enough here. */
export const boundaryCentre = (
  points: RegulatorPoint[],
): RegulatorPoint | null => {
  if (points.length < 3) return null;
  // Measured from the first corner: multiplying raw coordinates (about 72 and 23)
  // loses the small differences that make up a site a few hundred metres across.
  const origin = points[0];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const ax = points[i].lng - origin.lng;
    const ay = points[i].lat - origin.lat;
    const next = points[(i + 1) % points.length];
    const bx = next.lng - origin.lng;
    const by = next.lat - origin.lat;
    const cross = ax * by - bx * ay;
    area += cross;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
  }
  const round = (value: number) => Math.round(value * 1e7) / 1e7;
  if (Math.abs(area) < 1e-14) {
    return {
      lat: round(points.reduce((sum, p) => sum + p.lat, 0) / points.length),
      lng: round(points.reduce((sum, p) => sum + p.lng, 0) / points.length),
    };
  }
  return {
    lat: round(origin.lat + cy / (3 * area)),
    lng: round(origin.lng + cx / (3 * area)),
  };
};

/** Names and stated project counts of the professionals a list carries; nothing
 * else about them is read. */
const parties = (
  rows: unknown,
  nameKey: string,
  countKey: string,
): RegulatorParty[] =>
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const item = asRecord(row);
    const name = text(item?.[nameKey]);
    if (!name) return [];
    const count = Number(item?.[countKey]);
    return [
      {
        name,
        projectsCompleted: Number.isInteger(count) && count >= 0 ? count : null,
      },
    ];
  });

/** The highest-numbered "Q-n" filing. The list also carries other filing kinds
 * ("BWA-n"), which are not quarterly progress reports. */
const latestQuarter = (rows: unknown): RegulatorQuarter | null => {
  if (!Array.isArray(rows)) return null;
  let best: { index: number; quarter: RegulatorQuarter } | null = null;
  for (const row of rows) {
    const item = asRecord(row);
    const name = text(item?.quarterName);
    const index = finiteNumber(item?.qtrIndex);
    if (!item || !name || index === null || !/^Q-\d+$/.test(name)) continue;
    const periodEndsOn = isoDate(item.endDate);
    const dueOn = isoDate(item.extendedDate) ?? periodEndsOn;
    if (!periodEndsOn || !dueOn) continue;
    if (best === null || index > best.index) {
      best = {
        index,
        quarter: {
          name,
          periodEndsOn,
          dueOn,
          submittedOn: isoDate(item.submittedOn),
          status: text(item.status) ?? "UNKNOWN",
        },
      };
    }
  }
  return best?.quarter ?? null;
};
