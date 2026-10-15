import 'server-only';

import { INTERNAL_USER_PANELS } from './internal-user-positions.js';
import { internalRolePanel } from './internal-role-panels.js';

const PANEL_IDS = new Set(INTERNAL_USER_PANELS.map(panel => panel.id));
const EXTRA_ACTIONS = new Set([
  'internal_settings.read', 'internal_settings.hubstaff_members.read',
  'integration_settings.read', 'audit_log.read',
]);

export async function auditInternalPanelReads(db, actorUserId, panelIds) {
  const unique = [...new Set(panelIds)];
  if (unique.some(id => !PANEL_IDS.has(id))) throw new TypeError('Unknown internal panel audit action.');
  if (!unique.length) return;
  await db.query(`INSERT INTO portal_internal_access_audit(actor_user_id,target_user_id,action)
    SELECT $1,$1,'panel.read.' || selected.panel_id
    FROM unnest($2::text[]) AS selected(panel_id)`,
  [actorUserId, unique]);
}

export async function auditInternalRoleView(db, actorUserId, roleId) {
  if (!internalRolePanel(roleId)) throw new TypeError('Unknown internal role audit action.');
  await db.query(`INSERT INTO portal_internal_access_audit(actor_user_id,target_user_id,action)
    VALUES($1,$1,$2)`, [actorUserId, `role.view.${roleId}`]);
}

export async function auditInternalAction(db, actorUserId, action) {
  if (!EXTRA_ACTIONS.has(action)) throw new TypeError('Unknown internal audit action.');
  await db.query(`INSERT INTO portal_internal_access_audit(actor_user_id,target_user_id,action)
    VALUES($1,$1,$2)`, [actorUserId, action]);
}
