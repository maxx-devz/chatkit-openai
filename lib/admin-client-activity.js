// Counts only: no conversation titles, prompts, messages or credentials.
export async function readAdminClientActivity(db) {
  const ready=(await db.query("SELECT to_regclass('portal_chatkit_threads') AS threads,to_regclass('portal_ai_usage_events') AS usage")).rows[0];
  if(!ready.threads || !ready.usage)return new Map();
  const rows=(await db.query(`SELECT c.id::text,
    (SELECT COUNT(*)::int FROM portal_chatkit_threads t WHERE t.client_id=c.id) AS conversations,
    GREATEST((SELECT MAX(t.created_at) FROM portal_chatkit_threads t WHERE t.client_id=c.id),
      (SELECT MAX(GREATEST(u.started_at,u.finished_at)) FROM portal_ai_usage_events u WHERE u.client_id=c.id)) AS activity
    FROM portal_clients c`)).rows;
  return new Map(rows.map(row=>[row.id,row]));
}
