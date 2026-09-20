import { createGujreraAdapter } from "./gujrera";
import type { RegulatorAdapter } from "./types";

/**
 * The regulators we can read. Launch is Ahmedabad only, so this holds GujRERA; a
 * new state means one adapter file and one entry here — the fetch, comparison and
 * screens never name a regulator.
 *
 * A registration number picks its regulator (each state prints its own prefix), so
 * an admin never chooses one and a Maharashtra number can never be sent to
 * GujRERA. `CITY_REGULATORS` records which regulator covers which city, for
 * screens that want to say "expected a GujRERA number" before a number is typed.
 */
export const createRegulatorRegistry = (adapters: RegulatorAdapter[]) => ({
  all: () => adapters,
  byCode: (code: string) => adapters.find((a) => a.code === code) ?? null,
  forRegistrationNumber: (registrationNumber: string) =>
    adapters.find((a) => a.ownsRegistrationNumber(registrationNumber)) ?? null,
});

export type RegulatorRegistry = ReturnType<typeof createRegulatorRegistry>;

export const CITY_REGULATORS: Record<string, string> = {
  ahmedabad: "gujrera",
  gandhinagar: "gujrera",
};

let defaultRegistry: RegulatorRegistry | null = null;

/** Built on first use so importing this module makes no network object. */
export const getRegulatorRegistry = (): RegulatorRegistry => {
  defaultRegistry ??= createRegulatorRegistry([createGujreraAdapter()]);
  return defaultRegistry;
};
