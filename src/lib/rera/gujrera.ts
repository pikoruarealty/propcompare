import { legacyTlsFetch } from "./legacy-tls-fetch";
import {
  RegulatorError,
  type RegulatorAdapter,
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
 *  - Money never enters our database. The search result carries min/max project
 *    cost, the detail carries land and construction cost, and the form-three
 *    inventory lists a price for every unit. This adapter reads only the named
 *    fields it needs and never stores a raw response.
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

  return {
    code: "gujrera",
    label: "GujRERA",

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

      const progressBody = asRecord(
        await optional(
          gaps,
          "construction progress",
          `/formone/public/getfrom-one-progs-rept-projectid/${projectId}`,
        ),
      );
      const progress = finiteNumber(progressBody?.data);
      const constructionProgressPercent =
        progress !== null && progress >= 0 && progress <= 100 ? progress : null;
      if (
        constructionProgressPercent === null &&
        !gaps.includes("construction progress")
      ) {
        gaps.push("construction progress");
      }

      let totalUnits: number | null = null;
      const formThreeId = String(summary?.formThreeId ?? "");
      if (/^\d{1,12}$/.test(formThreeId)) {
        const inventory = asRecord(
          await optional(
            gaps,
            "unit count",
            `/formthree/public/get-fromthree-a-details-byid/${formThreeId}`,
          ),
        );
        const units = finiteNumber(inventory?.numberOfUnits);
        totalUnits =
          units !== null && Number.isInteger(units) && units > 0 ? units : null;
        if (totalUnits === null && !gaps.includes("unit count")) {
          gaps.push("unit count");
        }
      } else if (summary) {
        gaps.push("unit count");
      }

      // The block list lives with the registration's form-one.
      const formOneId = String(summary?.formOneId ?? "");
      let blocks: RegulatorRecord["blocks"] = [];
      if (/^\d{1,12}$/.test(formOneId)) {
        const formOne = asRecord(
          await optional(
            gaps,
            "blocks",
            `/formone/public/getfrom-one-byformone-id/${formOneId}`,
          ),
        );
        const list = asRecord(formOne?.data ?? formOne)?.formOneAList;
        blocks = (Array.isArray(list) ? list : []).flatMap((entry) => {
          const block = asRecord(entry);
          const name = text(block?.blockName);
          if (!name) return [];
          const slabs = Number(block?.totalNoOfSlabs);
          return [
            {
              name,
              slabs: Number.isInteger(slabs) && slabs > 0 ? slabs : null,
            },
          ];
        });
      }

      const developments = Array.isArray(detail?.dev) ? detail.dev : [];
      const swimmingPool = developments.some(
        (entry) => asRecord(entry)?.sewSwimCapacityFlag === "Yes",
      );

      const quarters = asRecord(
        await optional(
          gaps,
          "quarterly filings",
          `/quarter/public/getprojectqtrs/${projectId}`,
        ),
      );

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
        landAreaSqm: positive(
          project.totLandAreaForProjectUnderReg ??
            project.totAreaOfLandLayout ??
            project.totAreaOfLand,
        ),
        coveredParkingSlots: positive(project.coveredParking),
        blocks,
        declaredAmenityKeys: swimmingPool ? ["swimming_pool"] : [],
        latestQuarter: latestQuarter(quarters?.data),
        sourceUrl: `${ORIGIN}/#/search-glob/gloabl-data`,
        fetchedAt: now().toISOString(),
        gaps,
      } satisfies RegulatorRecord;
    },
  };
};

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
