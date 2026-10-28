export function spendingPeriod(value = new Date().toISOString().slice(0, 7)) {
  if (typeof value !== "string" || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)) {
    throw new TypeError("Choose a valid month in YYYY-MM format.");
  }
  const start = new Date(`${value}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { period: value, start: start.toISOString(), end: end.toISOString() };
}

export async function readClientSpending(db, period) {
  const range = spendingPeriod(period);
  try {
    const state = (await db.query("SELECT started_at FROM portal_ai_cost_state WHERE id=1")).rows[0];
    const rows = (await db.query(`WITH client_rows AS (
      SELECT id,slug,display_name FROM portal_clients
      UNION ALL SELECT NULL::bigint,'__archived__','Archived/deleted clients'
      WHERE EXISTS (SELECT 1 FROM portal_ai_cost_events WHERE client_id IS NULL AND occurred_at >= $1 AND occurred_at < $2)
    ), costs AS (
      SELECT client_id,COUNT(*) AS events,COUNT(DISTINCT request_id) AS turns,
        COUNT(*) FILTER (WHERE basis='unknown') AS unknown_events,
        COUNT(*) FILTER (WHERE basis='estimated') AS estimated_events,
        COUNT(*) FILTER (WHERE basis='reported') AS reported_events,
        ARRAY_AGG(DISTINCT reason) FILTER (WHERE basis='unknown') AS unpriced_reasons,
        SUM(amount_usd) AS known_usd,
        SUM(amount_usd) FILTER (WHERE basis='reported') AS reported_usd,
        SUM(amount_usd) FILTER (WHERE basis='estimated') AS estimated_usd,
        MAX(recorded_at) AS last_recorded
      FROM portal_ai_cost_events WHERE occurred_at >= $1 AND occurred_at < $2 GROUP BY client_id
    ), missing AS (
      SELECT e.client_id,COUNT(*) AS missing_turns FROM portal_ai_usage_events e
      WHERE e.action='client_ai.reply' AND e.started_at >= $1 AND e.started_at < $2
        AND NOT EXISTS (SELECT 1 FROM portal_ai_cost_events k WHERE k.request_id=e.request_id)
      GROUP BY e.client_id
    ) SELECT c.slug,c.display_name AS name,COALESCE(s.events,0) AS events,
      COALESCE(s.turns,0) AS turns,COALESCE(s.unknown_events,0) AS unknown_events,
      COALESCE(s.estimated_events,0) AS estimated_events,COALESCE(s.reported_events,0) AS reported_events,
      s.known_usd,s.reported_usd,s.estimated_usd,s.last_recorded,s.unpriced_reasons,
      COALESCE(m.missing_turns,0) AS missing_turns
    FROM client_rows c LEFT JOIN costs s ON s.client_id IS NOT DISTINCT FROM c.id
    LEFT JOIN missing m ON m.client_id IS NOT DISTINCT FROM c.id ORDER BY c.display_name,c.id`, [range.start, range.end])).rows;
    return { ready: true, period: range.period, currency: "USD", trackingStartedAt: state?.started_at || null,
      fetchedAt: new Date().toISOString(), clients: rows.map(row => ({
        slug: row.slug, name: row.name, events: Number(row.events), turns: Number(row.turns),
        unpricedEvents: Number(row.unknown_events), missingTurns: Number(row.missing_turns),
        estimatedEvents: Number(row.estimated_events), reportedEvents: Number(row.reported_events),
        knownUsd: row.known_usd ?? null, reportedUsd: row.reported_usd ?? null,
        estimatedUsd: row.estimated_usd ?? null, lastRecordedAt: row.last_recorded,
        unpricedReasons: row.unpriced_reasons || [],
        partialHistory: !state?.started_at || new Date(state.started_at) > new Date(range.start),
      })) };
  } catch (error) {
    if (error?.code !== "42P01") throw error;
    return { ready: false, period: range.period, currency: "USD", clients: [],
      setupMessage: "Run npm run ai-costs:migrate after the audit migrations, then restart the Python backend." };
  }
}
