import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** Raw events are kept this many whole months (owner answer, 2026-09-25). */
export const RAW_RETENTION_MONTHS = 13;

/**
 * Rolls every whole month older than the retention window into the monthly
 * counts (events per event and property, and each pair of properties compared
 * together), then deletes those raw rows, in one transaction so a failure leaves
 * both as they were. Month-aligned, so a month is always rolled up whole, once.
 */
export const purgeOldAnalytics = async (
  db: PostgresJsDatabase,
  now: Date = new Date(),
): Promise<{ cutoff: string; deleted: number }> => {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RAW_RETENTION_MONTHS, 1),
  );
  const at = cutoff.toISOString();

  const deleted = await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into analytics_event_monthly
        (month, event, property_id, events, visitors, engaged_ms)
      select date_trunc('month', occurred_at at time zone 'UTC')::date,
             event, property_id, count(*), count(distinct visitor_id),
             coalesce(sum(engaged_ms), 0)
      from analytics_events
      where occurred_at < ${at}::timestamptz
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
      group by 1, 2, 3
      on conflict (month, property_a, property_b) do update set
        comparisons = analytics_pair_monthly.comparisons + excluded.comparisons,
        visitors = analytics_pair_monthly.visitors + excluded.visitors`);

    const removed = await tx.execute(sql`
      delete from analytics_events where occurred_at < ${at}::timestamptz`);
    return removed.count;
  });
  return { cutoff: at, deleted };
};
