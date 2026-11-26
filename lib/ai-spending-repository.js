import {usageSinceReset} from './ai-usage-reset-sql.js';

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
      WHERE EXISTS (SELECT 1 FROM portal_ai_cost_events e WHERE client_id IS NULL AND occurred_at >= $1 AND occurred_at < $2 AND to_jsonb(e)->>'cleared_at' IS NULL)
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
      FROM portal_ai_cost_events e WHERE occurred_at >= $1 AND occurred_at < $2
        AND to_jsonb(e)->>'cleared_at' IS NULL AND ${usageSinceReset('e')}
        AND NOT EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=e.request_id AND to_jsonb(u)->>'cleared_at' IS NOT NULL)
      GROUP BY client_id
    ), missing AS (
      SELECT e.client_id,COUNT(*) AS missing_turns FROM portal_ai_usage_events e
      WHERE e.action='client_ai.reply' AND e.started_at >= $1 AND e.started_at < $2 AND to_jsonb(e)->>'cleared_at' IS NULL AND ${usageSinceReset('e','started_at')}
        AND NOT EXISTS (SELECT 1 FROM portal_ai_cost_events k WHERE k.request_id=e.request_id)
      GROUP BY e.client_id
    ) SELECT c.slug,c.display_name AS name,COALESCE(s.events,0) AS events,
      COALESCE(s.turns,0) AS turns,COALESCE(s.unknown_events,0) AS unknown_events,
      COALESCE(s.estimated_events,0) AS estimated_events,COALESCE(s.reported_events,0) AS reported_events,
      CASE WHEN COALESCE(s.events,0)=0 AND COALESCE(m.missing_turns,0)=0 THEN 0::numeric ELSE s.known_usd END AS known_usd,
      s.reported_usd,s.estimated_usd,s.last_recorded,s.unpriced_reasons,
      COALESCE(m.missing_turns,0) AS missing_turns
    FROM client_rows c LEFT JOIN costs s ON s.client_id IS NOT DISTINCT FROM c.id
    LEFT JOIN missing m ON m.client_id IS NOT DISTINCT FROM c.id ORDER BY c.display_name,c.id`, [range.start, range.end])).rows;
    const detailRows=(await db.query(`SELECT c.slug,c.display_name AS name,e.provider,e.model,
      CASE WHEN e.pricing_snapshot->'connection'->>'organizationId' ~ '^org-[A-Za-z0-9_-]{1,160}$' THEN e.pricing_snapshot->'connection'->>'organizationId' END organization_id,
      CASE WHEN e.pricing_snapshot->'connection'->>'projectId' ~ '^proj_[A-Za-z0-9_-]{1,160}$' THEN e.pricing_snapshot->'connection'->>'projectId' END project_id,
      COUNT(DISTINCT e.request_id)::int requests,CASE WHEN COUNT(*) FILTER(WHERE e.kind='chat' AND e.input_tokens IS NULL)>0 THEN NULL ELSE SUM(e.input_tokens) END input_tokens,CASE WHEN COUNT(*) FILTER(WHERE e.kind='chat' AND e.output_tokens IS NULL)>0 THEN NULL ELSE SUM(e.output_tokens) END output_tokens,
      SUM(e.amount_usd) known_usd,COUNT(*) FILTER(WHERE e.basis='unknown')::int unknown_events,
      COUNT(*) FILTER(WHERE e.basis='estimated')::int estimated_events
      FROM portal_ai_cost_events e LEFT JOIN portal_clients c ON c.id=e.client_id
      WHERE e.occurred_at >= $1 AND e.occurred_at < $2 AND to_jsonb(e)->>'cleared_at' IS NULL AND ${usageSinceReset('e')}
      AND NOT EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=e.request_id AND to_jsonb(u)->>'cleared_at' IS NOT NULL)
      GROUP BY c.id,c.slug,c.display_name,e.provider,e.model,organization_id,project_id ORDER BY c.display_name,e.model LIMIT 501`,[range.start,range.end])).rows;
    const modelUsage=detailRows.slice(0,500).map(row=>({client:row.name||'Archived/deleted client',slug:row.slug||null,provider:row.provider,model:row.model,organizationId:row.organization_id||null,projectId:row.project_id||null,requests:Number(row.requests),inputTokens:row.input_tokens===null?null:Number(row.input_tokens),outputTokens:row.output_tokens===null?null:Number(row.output_tokens),knownUsd:row.known_usd??null,unknownEvents:Number(row.unknown_events),estimatedEvents:Number(row.estimated_events)}));
    return {modelUsage,modelUsageTruncated:detailRows.length>500, ready: true, period: range.period, currency: "USD", trackingStartedAt: state?.started_at || null,
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
