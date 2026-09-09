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
  const clients = (await db.query(`SELECT c.display_name AS name,c.portal_enabled,c.ai_enabled,
    c.monthly_prompt_limit AS allowance,COALESCE(u.requests_used,0) AS used
    FROM portal_clients c LEFT JOIN portal_ai_usage_monthly u ON c.id=u.client_id
    AND u.period_start=DATE_TRUNC('month',NOW() AT TIME ZONE 'UTC')::date ORDER BY c.display_name`)).rows;
  let activity = null;
  try {
    activity = (await db.query(`SELECT source,runs,reported_runs,input_tokens,output_tokens,total_tokens,first_recorded_at
      FROM portal_ai_activity_monthly WHERE period_start=DATE_TRUNC('month',NOW() AT TIME ZONE 'UTC')::date`)).rows;
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
    clients: clients.map(row => ({ name: row.name, used: Number(row.used), allowance: Number(row.allowance),
      remaining: Math.max(0, Number(row.allowance) - Number(row.used)), enabled: row.portal_enabled && row.ai_enabled })),
  };
}
