import 'server-only';

import { randomUUID } from 'node:crypto';

const actions = new Set([
  'client.document.add', 'client.document.remove', 'client.audit.read',
  'aoc.client.create', 'aoc.client.update', 'aoc.client.usage_reset',
  'aoc.provider.update', 'aoc.model.update', 'aoc.builder.save',
  'aoc.builder.publish', 'aoc.builder.reset', 'aoc.audit.read',
]);
const targetTypes = new Set(['client', 'document', 'provider', 'model', 'builder', 'audit']);
const aiActions = new Set(['client_ai.reply', 'admin_ai.reply', 'builder.preview']);

export async function recordPortalAuditEvent(db, { audience, clientId = null, actorUserId,
  action, targetType, targetId = null }) {
  if (!['client', 'aoc_admin'].includes(audience) || !actions.has(action)
    || !targetTypes.has(targetType) || (audience === 'client' && !clientId)) {
    throw new TypeError('Invalid portal audit event.');
  }
  await db.query(`INSERT INTO portal_audit_events
    (audience,client_id,actor_user_id,action,target_type,target_id)
    VALUES($1,$2,$3,$4,$5,$6)`,
  [audience, clientId, actorUserId, action, targetType, targetId]);
}

// One idempotent event represents one user action, even when an agent makes
// multiple model calls. Unknown provider usage stays NULL rather than zero.
export async function recordAiUsageEvent(db, { requestId = randomUUID(), clientId = null,
  actorUserId, action, provider = null, model = null, status, usage = null, startedAt }) {
  if (!aiActions.has(action) || !['succeeded', 'failed', 'cancelled'].includes(status)
    || (action === 'client_ai.reply' && !clientId)) throw new TypeError('Invalid AI usage event.');
  const values = [usage?.input_tokens, usage?.output_tokens, usage?.total_tokens];
  const reported = values.every(value => Number.isSafeInteger(value) && value >= 0);
  await db.query(`INSERT INTO portal_ai_usage_events
    (request_id,client_id,actor_user_id,action,provider,model,status,
      input_tokens,output_tokens,total_tokens,started_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(request_id) DO NOTHING`,
  [requestId, clientId, actorUserId, action, provider, model, status,
    ...(reported ? values : [null, null, null]), startedAt]);
  return requestId;
}
