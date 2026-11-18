// Accept only provider-reported usage, never estimates derived from text length.
export function usageValues(usage) {
  const values = [usage?.input_tokens, usage?.output_tokens, usage?.total_tokens];
  const valid = values.every(value => Number.isSafeInteger(value) && value >= 0);
  return valid ? [1, ...values] : [0, 0, 0, 0];
}

export async function recordUsage(db, source, startedAt, usage) {
  if (!["client", "admin", "preview"].includes(source)) throw new Error("Invalid usage source");
  await db.query(`INSERT INTO portal_ai_activity_monthly
    (source,period_start,runs,reported_runs,input_tokens,output_tokens,total_tokens,first_recorded_at)
    VALUES($1,DATE_TRUNC('month',$2::timestamptz AT TIME ZONE 'UTC')::date,1,$3,$4,$5,$6,$2)
    ON CONFLICT(source,period_start) DO UPDATE SET
      runs=portal_ai_activity_monthly.runs+1,
      reported_runs=portal_ai_activity_monthly.reported_runs+EXCLUDED.reported_runs,
      input_tokens=portal_ai_activity_monthly.input_tokens+EXCLUDED.input_tokens,
      output_tokens=portal_ai_activity_monthly.output_tokens+EXCLUDED.output_tokens,
      total_tokens=portal_ai_activity_monthly.total_tokens+EXCLUDED.total_tokens,
      first_recorded_at=LEAST(portal_ai_activity_monthly.first_recorded_at,EXCLUDED.first_recorded_at),
      updated_at=NOW()`, [source, startedAt, ...usageValues(usage)]);
}

export async function recordProviderStatus(db, credentialHash, code, model, observedAt = new Date()) {
  await db.query(`INSERT INTO portal_ai_provider_status(credential_hash,code,model,observed_at)
    VALUES($1,$2,$3,$4) ON CONFLICT(credential_hash) DO UPDATE SET
    code=EXCLUDED.code,model=EXCLUDED.model,observed_at=EXCLUDED.observed_at
    WHERE portal_ai_provider_status.observed_at <= EXCLUDED.observed_at`,
  [credentialHash, code, String(model || "").slice(0, 120), observedAt]);
}

export async function readUsage(db, credentialHash = "") {
  const clients = (await db.query(`SELECT c.id::text,c.slug,c.display_name AS name,c.portal_enabled,c.ai_enabled,
    (SELECT COUNT(*) FROM portal_ai_usage_events u WHERE u.client_id=c.id AND u.action='client_ai.reply'
      AND to_jsonb(u)->>'cleared_at' IS NULL AND NOT EXISTS(SELECT 1 FROM portal_ai_usage_resets reset WHERE reset.client_id=u.client_id AND (reset.period='all' OR reset.period=to_char(u.started_at AT TIME ZONE 'UTC','YYYY-MM')) AND u.started_at<=reset.reset_before)
      AND u.started_at>=DATE_TRUNC('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND u.started_at<(DATE_TRUNC('month',NOW() AT TIME ZONE 'UTC')+INTERVAL '1 month') AT TIME ZONE 'UTC') AS used
    FROM portal_clients c ORDER BY c.display_name`)).rows;
  let activity = null;
  try {
    activity = (await db.query(`SELECT CASE action WHEN 'client_ai.reply' THEN 'client' WHEN 'admin_ai.reply' THEN 'admin' ELSE 'preview' END AS source,
      COUNT(*)::int AS runs,COUNT(*) FILTER(WHERE input_tokens IS NOT NULL)::int AS reported_runs,MIN(started_at) AS first_recorded_at
      FROM portal_ai_usage_events u WHERE to_jsonb(u)->>'cleared_at' IS NULL AND NOT EXISTS(SELECT 1 FROM portal_ai_usage_resets reset WHERE reset.client_id=u.client_id AND (reset.period='all' OR reset.period=to_char(u.started_at AT TIME ZONE 'UTC','YYYY-MM')) AND u.started_at<=reset.reset_before)
        AND started_at>=DATE_TRUNC('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        AND started_at<(DATE_TRUNC('month',NOW() AT TIME ZONE 'UTC')+INTERVAL '1 month') AT TIME ZONE 'UTC'
      GROUP BY 1`)).rows;
  } catch (error) {
    if (error?.code !== "42P01") throw error;
  }
  let apiStatus = null;
  let statusTrackingReady = true;
  try {
    apiStatus = (await db.query(`SELECT code,model,observed_at AS "observedAt"
      FROM portal_ai_provider_status WHERE credential_hash=$1`, [credentialHash])).rows[0] || null;
  } catch (error) {
    if (error?.code !== "42P01") throw error;
    statusTrackingReady = false;
  }
  return {
    fetchedAt: new Date().toISOString(),
    period: new Date().toISOString().slice(0, 7),
    trackingReady: activity !== null,
    statusTrackingReady,
    apiStatus,
    activity: activity || [],
    requestLimitEnabled: false,
    clients: clients.map(row => ({id:row.id,slug:row.slug,name:row.name,used:Number(row.used),allowance:null,remaining:null,enabled:row.portal_enabled && row.ai_enabled})),
  };
}
