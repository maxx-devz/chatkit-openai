import 'server-only';

import { databasePool } from '@/lib/database';
import { resolveAdminContext } from '@/lib/admin-data';
import { requireClientPermission } from '@/lib/portal-data';
import { recordPortalAuditEvent } from '@/lib/portal-audit';

const PAGE_SIZE = 20;
const pageNumber = value => /^[1-9]\d{0,4}$/.test(String(value || ''))
  ? Math.min(Number(value), 10000) : 1;
const snapshot = value => typeof value === 'string' && !Number.isNaN(Date.parse(value))
  ? value : new Date().toISOString();
const clientFilter = value => {
  const candidate = String(value || '');
  return /^[1-9]\d{0,18}$/.test(candidate) && BigInt(candidate) <= 9223372036854775807n
    ? candidate : null;
};
const pageRows = rows => ({ rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE });

export async function loadClientAudit(requestHeaders, options = {}) {
  const context = await requireClientPermission(requestHeaders, 'client.access_audit.read');
  const asOf = snapshot(options.asOf);
  const eventPage = pageNumber(options.eventPage);
  const usagePage = pageNumber(options.usagePage);
  const clientId = context.client.id;
  const [events, usage] = await Promise.all([
    databasePool.query(`SELECT kind,id,action,actor_name,target_name,occurred_at FROM (
      SELECT 'access' AS kind,a.id::text AS id,a.action,
        COALESCE(actor.display_name,CASE WHEN a.source='terminal' THEN 'AOC terminal' ELSE 'AOC' END) AS actor_name,
        COALESCE(target.display_name,'Former user') AS target_name,a.occurred_at
      FROM portal_client_access_audit a
      LEFT JOIN portal_users actor ON actor.id=a.actor_user_id
      LEFT JOIN portal_users target ON target.id=a.target_user_id
      WHERE a.client_id=$1 AND a.occurred_at<=$2
      UNION ALL
      SELECT 'activity',e.id::text,e.action,COALESCE(actor.display_name,'Former user'),
        COALESCE(e.target_id,e.target_type),e.occurred_at
      FROM portal_audit_events e LEFT JOIN portal_users actor ON actor.id=e.actor_user_id
      WHERE e.audience='client' AND e.client_id=$1 AND e.occurred_at<=$2
    ) events ORDER BY occurred_at DESC,kind DESC,id DESC LIMIT $3 OFFSET $4`,
    [clientId, asOf, PAGE_SIZE + 1, (eventPage - 1) * PAGE_SIZE]),
    databasePool.query(`SELECT request_id::text,action,provider,model,status,input_tokens,
      output_tokens,total_tokens,started_at,
      COALESCE(actor.display_name,'Former user') AS actor_name
      FROM portal_ai_usage_events u LEFT JOIN portal_users actor ON actor.id=u.actor_user_id
      WHERE u.client_id=$1 AND u.started_at<=$2 AND u.action='client_ai.reply'
      ORDER BY u.started_at DESC,u.request_id DESC LIMIT $3 OFFSET $4`,
    [clientId, asOf, PAGE_SIZE + 1, (usagePage - 1) * PAGE_SIZE]),
  ]);
  await recordPortalAuditEvent(databasePool, { audience: 'client', clientId,
    actorUserId: context.user.id, action: 'client.audit.read', targetType: 'audit' });
  return { events: pageRows(events.rows), usage: pageRows(usage.rows),
    pagination: { asOf, eventPage, usagePage, pageSize: PAGE_SIZE } };
}

export async function loadAocAdminAudit(requestHeaders, options = {}) {
  const { admin } = await resolveAdminContext(requestHeaders);
  const asOf = snapshot(options.asOf);
  const eventPage = pageNumber(options.eventPage);
  const integrationPage = pageNumber(options.integrationPage);
  const usagePage = pageNumber(options.usagePage);
  const clientId = clientFilter(options.clientId);
  const [clients, events, integrations, usage] = await Promise.all([
    databasePool.query('SELECT id::text,display_name FROM portal_clients ORDER BY display_name'),
    databasePool.query(`SELECT kind,id,client_name,actor_name,action,target_type,target_id,occurred_at FROM (
      SELECT 'action' AS kind,e.id::text AS id,COALESCE(c.display_name,'AOC / platform') AS client_name,
        COALESCE(actor.display_name,'Former user') AS actor_name,e.action,e.target_type,e.target_id,e.occurred_at
      FROM portal_audit_events e
      LEFT JOIN portal_clients c ON c.id=e.client_id
      LEFT JOIN portal_users actor ON actor.id=e.actor_user_id
      WHERE e.audience='aoc_admin' AND e.occurred_at<=$1 AND ($2::bigint IS NULL OR e.client_id=$2)
      UNION ALL
      SELECT 'access',a.id::text,COALESCE(c.display_name,'Former client'),
        COALESCE(actor.display_name,'AOC terminal'),'client.' || a.action,
        'member',a.target_user_id::text,a.occurred_at
      FROM portal_client_access_audit a
      LEFT JOIN portal_clients c ON c.id=a.client_id
      LEFT JOIN portal_users actor ON actor.id=a.actor_user_id
      WHERE a.source IN ('aoc_admin','terminal') AND a.occurred_at<=$1
        AND ($2::bigint IS NULL OR a.client_id=$2)
    ) actions ORDER BY occurred_at DESC,kind DESC,id DESC LIMIT $3 OFFSET $4`,
    [asOf, clientId, PAGE_SIZE + 1, (eventPage - 1) * PAGE_SIZE]),
    databasePool.query(`SELECT r.id::text,r.source,r.operation,r.portal_area,r.status,
      r.records_processed,r.error_code,r.started_at,r.finished_at,
      COALESCE(c.display_name,'AOC / platform') AS client_name
      FROM portal_integration_runs r LEFT JOIN portal_clients c ON c.id=r.client_id
      WHERE r.portal_area IN ('aoc_admin','client_portal') AND r.started_at<=$1
        AND ($2::bigint IS NULL OR r.client_id=$2)
      ORDER BY r.started_at DESC,r.id DESC LIMIT $3 OFFSET $4`,
    [asOf, clientId, PAGE_SIZE + 1, (integrationPage - 1) * PAGE_SIZE]),
    databasePool.query(`SELECT u.request_id::text,u.action,u.provider,u.model,u.status,
      u.input_tokens,u.output_tokens,u.total_tokens,u.started_at,
      COALESCE(c.display_name,'AOC / platform') AS client_name,
      COALESCE(actor.display_name,'Former user') AS actor_name
      FROM portal_ai_usage_events u
      LEFT JOIN portal_clients c ON c.id=u.client_id
      LEFT JOIN portal_users actor ON actor.id=u.actor_user_id
      WHERE u.started_at<=$1 AND ($2::bigint IS NULL OR u.client_id=$2)
      ORDER BY u.started_at DESC,u.request_id DESC LIMIT $3 OFFSET $4`,
    [asOf, clientId, PAGE_SIZE + 1, (usagePage - 1) * PAGE_SIZE]),
  ]);
  await recordPortalAuditEvent(databasePool, { audience: 'aoc_admin', actorUserId: admin.id,
    action: 'aoc.audit.read', targetType: 'audit' });
  return { clients: clients.rows, events: pageRows(events.rows), integrations: pageRows(integrations.rows),
    usage: pageRows(usage.rows), pagination: { asOf, eventPage, integrationPage, usagePage,
      clientId, pageSize: PAGE_SIZE } };
}
