// These are server-owned SQL identifiers, never user input.
export function usageSinceReset(alias,dateColumn='occurred_at') {
  if(!/^[a-z][a-z0-9_]*$/.test(alias) || !['occurred_at','started_at'].includes(dateColumn))throw Error('Invalid reset SQL identifier');
  return `NOT EXISTS(SELECT 1 FROM portal_ai_usage_resets reset
    WHERE reset.client_id=${alias}.client_id
      AND (reset.period='all' OR reset.period=to_char(${alias}.${dateColumn} AT TIME ZONE 'UTC','YYYY-MM'))
      AND ${alias}.${dateColumn}<=reset.reset_before)`;
}
export function creditSinceReset(alias='e') {
  return `(${alias}.kind IN ('allocation','adjustment') OR ${usageSinceReset(alias)})`;
}
