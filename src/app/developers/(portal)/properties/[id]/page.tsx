import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { developerReaderDb } from "@/db/developer-reader";
import { PropertyView } from "@/components/developers/analytics-report";
import { DeveloperShell } from "@/components/developers/developer-shell";
import { requirePortalRole } from "@/lib/accounts/session";
import { getPropertyReport } from "@/lib/developers/analytics/report";
import {
  DEFAULT_REPORT_WINDOW,
  parseReportWindow,
} from "@/lib/developers/analytics/windows";

export const metadata: Metadata = {
  title: "Property analytics | Developer portal",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function DeveloperPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string | string[] }>;
}) {
  const { id } = await params;
  const session = await requirePortalRole(
    "developer",
    `/developers/properties/${encodeURIComponent(id)}`,
  );
  const { window: raw } = await searchParams;
  const window =
    parseReportWindow(Array.isArray(raw) ? null : raw) ?? DEFAULT_REPORT_WINDOW;
  const report = await getPropertyReport(
    { reader: developerReaderDb, catalog: db },
    session.role.developerId,
    id,
    window,
  );
  if (report === null) notFound();
  return (
    <DeveloperShell active="analytics" email={session.email}>
      <PropertyView report={report} window={window} />
    </DeveloperShell>
  );
}
