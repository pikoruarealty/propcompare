import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Raw events stay tied to a browser this many whole months (owner answer,
 * 2026-09-25); after that they are kept, anonymised (owner answer, 2026-09-26).
 */
export const RAW_RETENTION_MONTHS = 13;

/**
 * Anonymises every whole month older than the retention window: first adds the
 * month's counts (events per event and property, and each pair of properties
 * compared together, both with their distinct-visitor figures, which the cleared
 * ids would otherwise take with them), then clears each row's visitor and visit
 * ids and stamps it. The events themselves stay, with everything but the ids, so
 * a year-on-year look at a property or a pair keeps its device, source, budget
 * band, sections and time. One transaction, month-aligned, and each row is
 * handled once (`anonymised_at`), so a re-run adds nothing twice.
 */
export const purgeOldAnalytics = async (
  db: PostgresJsDatabase,
  now: Date = new Date(),
): Promise<{ cutoff: string; anonymised: number }> => {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RAW_RETENTION_MONTHS, 1),
  );
  const at = cutoff.toISOString();

  const anonymised = await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into analytics_event_monthly
        (month, event, property_id, events, visitors, engaged_ms)
      select date_trunc('month', occurred_at at time zone 'UTC')::date,
             event, property_id, count(*), count(distinct visitor_id),
             coalesce(sum(engaged_ms), 0)
      from analytics_events
      where occurred_at < ${at}::timestamptz and anonymised_at is null
      group by 1, 2, 3
      on conflict on constraint analytics_event_monthly_unique do update set
        events = analytics_event_monthly.events + excluded.events,
        visitors = analytics_event_monthly.visitors + excluded.visitors,
        engaged_ms = analytics_event_monthly.engaged_ms + excluded.engaged_ms`);

    await tx.execute(sql`
      insert into analytics_pair_monthly
        (month, property_a, property_b, comparisons, visitors)
      select date_trunc('month', e.occurred_at at time zone 'UTC')::date,
             a.id, b.id, count(*), count(distinct e.visitor_id)
      from analytics_events e
      cross join lateral unnest(e.compared_ids) as a(id)
      cross join lateral unnest(e.compared_ids) as b(id)
      join properties pa on pa.id = a.id
      join properties pb on pb.id = b.id
      where e.event = 'compare_opened'
        and a.id < b.id
        and e.occurred_at < ${at}::timestamptz
        and e.anonymised_at is null
      group by 1, 2, 3
      on conflict (month, property_a, property_b) do update set
        comparisons = analytics_pair_monthly.comparisons + excluded.comparisons,
        visitors = analytics_pair_monthly.visitors + excluded.visitors`);

    const cleared = await tx.execute(sql`
      update analytics_events
      set visitor_id = null, session_id = null, anonymised_at = now()
      where occurred_at < ${at}::timestamptz and anonymised_at is null`);
    return cleared.count;
  });
  return { cutoff: at, anonymised };
};
