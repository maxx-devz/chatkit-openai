import 'server-only';
import { InternalUserError } from './internal-user-errors.js';
import { internalUserDatabase } from './internal-user-access.js';
import { requireInternalUserPermission } from './internal-user-data.js';
import { hasInternalPermission, INTERNAL_ROLE_PERMISSIONS } from './internal-permissions.js';
import { listActiveHubstaffMembers } from './internal-hubstaff-members.js';
import { hrMonthBounds, readHubstaffHrSource } from './internal-hubstaff-hr.js';
import { deriveTeamWorkStatus, TEAM_WORK_STATUS } from './internal-team-work-status.js';
import { INTERNAL_HR_PANEL_IDS, internalUserPosition } from './internal-user-positions.js';
import { canAccessInternalPanel } from './internal-panel-access.js';
import { finishIntegrationRun, safeIntegrationErrorCode, startIntegrationRun } from './integration-run-audit.js';
import { readInternalSyncFeed } from './internal-sync-cache.js';
import { auditInternalPanelReads } from './internal-panel-audit.js';

const HR_PERMISSIONS = INTERNAL_ROLE_PERMISSIONS.hr;

export function hrViewForPanels(view, visiblePanels, freshness = null) {
  const show = panel => visiblePanels.includes(panel);
  return {
    month: view.month, generatedAt: view.generatedAt, scheduleVerified: view.scheduleVerified,
    visiblePanels, freshness: freshness ? { hrRecords: freshness } : undefined,
    summary: show('hr_overview') ? view.summary : null,
    people: show('hr_schedule_coverage') ? view.people
      : view.people.map(person => ({ id: person.id, name: person.name })),
    calendarRequests: show('hr_leave_calendar') ? view.leaveRequests
      .filter(request => request.status === 'approved')
      .map(request => ({ id: request.id, personId: request.personId, days: request.days })) : [],
    leaveRequests: show('hr_leave_requests') ? view.leaveRequests : [],
    balances: show('hr_leave_balances') ? view.balances : [],
  };
}

function sourceError() {
  return new InternalUserError('hubstaff_unavailable',
    'HR data could not be verified from Hubstaff. Please try again.');
}

function safeText(value, limit = 120) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
}

function hubstaffId(value) {
  const id = String(value ?? '');
  return /^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : '';
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function instant(value) {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && Number.isFinite(Date.parse(value)) ? value : '';
}

function seconds(value, allowNegative = false) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (!allowNegative && number < 0)) throw sourceError();
  return number;
}

export function buildHrView(members, portalAccounts, source, month, now = new Date(),
  scheduleVerified = false) {
  const bounds = hrMonthBounds(month);
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) throw sourceError();
  const memberKeys = new Map(members.map((member, index) => [member.id, `hr-member-${index + 1}`]));
  const policies = new Map(source.policies.map(policy => [hubstaffId(policy?.id), safeText(policy?.name)]));
  const schedulesByMember = new Map(members.map(member => [member.id, []]));
  for (const schedule of source.schedules) {
    const list = schedulesByMember.get(schedule.userId);
    if (!list) continue;
    const startDate = dateKey(schedule.start_date);
    const startTime = safeText(schedule.start_time, 8);
    const durationSeconds = seconds(schedule.duration);
    if (!startDate || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(startTime)) throw sourceError();
    list.push({ startDate, startTime, durationSeconds,
      repeatSchedule: safeText(schedule.repeat_schedule, 20),
      weekdays: Array.isArray(schedule.weekdays) ? schedule.weekdays.map(day => safeText(day, 3)) : [],
      useTimeZone: safeText(schedule.use_time_zone, 20),
      repeatUntil: schedule.repeat_until ? dateKey(schedule.repeat_until) : null });
  }
  const people = members.map(member => {
    const portalPosition = portalAccounts.get(member.id);
    const schedules = schedulesByMember.get(member.id) || [];
    return { id: memberKeys.get(member.id), name: safeText(member.name),
      portalAccountMapped: portalAccounts.has(member.id),
      portalPosition: portalAccounts.has(member.id) ? internalUserPosition(portalPosition).label : null,
      scheduleCoverage: schedules.length ? 'On file' : 'Missing', schedules };
  });
  const leaveRequests = [];
  for (const request of source.requests) {
    const personId = memberKeys.get(request.userId);
    if (!personId) continue;
    const startAt = instant(request.starts_at);
    const stopAt = instant(request.stops_at);
    const status = safeText(request.status, 20);
    if (!hubstaffId(request.id) || !startAt || !stopAt
      || Date.parse(stopAt) <= Date.parse(startAt)
      || !['submitted', 'approved', 'denied'].includes(status)
      || !Array.isArray(request.time_off_request_days)) throw sourceError();
    const days = request.time_off_request_days.map(day => {
      const date = dateKey(day?.date);
      if (!date) throw sourceError();
      return { date, amountSeconds: seconds(day.amount_used),
        startAt: instant(day.starts_at) || null, stopAt: instant(day.stops_at) || null };
    }).filter(day => day.amountSeconds > 0 && day.date >= bounds.start.slice(0, 10)
      && day.date <= bounds.lastDay);
    if (!days.length) continue;
    leaveRequests.push({ id: `hr-leave-${leaveRequests.length + 1}`, personId,
      status, policy: policies.get(hubstaffId(request.time_off_policy_id)) || 'Policy unavailable',
      startAt, stopAt, days, reason: safeText(request.message, 2000),
      amountSeconds: days.reduce((sum, day) => sum + day.amountSeconds, 0) });
    if (leaveRequests.length > 500) throw sourceError();
  }
  leaveRequests.sort((a, b) => a.days[0].date.localeCompare(b.days[0].date)
    || a.personId.localeCompare(b.personId));
  const balances = source.balances.map(balance => {
    const personId = memberKeys.get(balance.userId);
    if (!personId || !hubstaffId(balance.time_off_policy_id)) throw sourceError();
    return { personId, policy: safeText(balance.policy_name)
      || policies.get(hubstaffId(balance.time_off_policy_id)) || 'Policy unavailable',
    amountSeconds: seconds(balance.amount, true), year: bounds.year };
  }).sort((a, b) => a.personId.localeCompare(b.personId) || a.policy.localeCompare(b.policy));
  const isCurrentMonth = now.toISOString().slice(0, 7) === month;
  const awayToday = isCurrentMonth ? members.filter(member => deriveTeamWorkStatus({
    requests: source.requests.filter(request => request.userId === member.id),
    schedules: [], now, complete: true,
  }) === TEAM_WORK_STATUS.AWAY).length : null;
  return { month, generatedAt: now.toISOString(), scheduleVerified,
    summary: { members: people.length, awayToday,
      approvedRequests: leaveRequests.filter(request => request.status === 'approved').length,
      pendingRequests: leaveRequests.filter(request => request.status === 'submitted').length,
      scheduleCoverage: people.filter(person => person.scheduleCoverage === 'On file').length },
    people, leaveRequests, balances };
}

export async function loadInternalHrDashboard(requestHeaders, month = new Date().toISOString().slice(0, 7),
  { force = false } = {}) {
  const { internalUser, profile } = await requireInternalUserPermission(requestHeaders, 'people.leave.read');
  if (!profile.roles.some(role => role === 'hr' || role === 'internal_admin')
    || !HR_PERMISSIONS.every(permission => hasInternalPermission(profile, permission))) {
    throw new InternalUserError('permission_forbidden', 'HR or Internal Admin access is required for this data.', 403);
  }
  const visiblePanels = INTERNAL_HR_PANEL_IDS.filter(panel => canAccessInternalPanel(profile, panel));
  if (!visiblePanels.length) {
    throw new InternalUserError('panel_forbidden', 'No HR panels are enabled for this account.', 403);
  }
  hrMonthBounds(month);
  const db = internalUserDatabase();
  const cached = await readInternalSyncFeed(db, { feed: 'hr_records', withMeta: true,
    scope: [month, month === new Date().toISOString().slice(0, 7) ? new Date().toISOString().slice(0, 10) : null,
      process.env.HUBSTAFF_ACCESS_TOKEN, process.env.HUBSTAFF_INTERNAL_TEAM_ID,
      process.env.HUBSTAFF_TEAM_SCHEDULES_VERIFIED], force,
    loader: async () => {
      const runId = await startIntegrationRun(db, {
        source: 'hubstaff', operation: 'hr_dashboard', actorUserId: internalUser.user_id,
      });
      try {
        let members;
        try { members = await listActiveHubstaffMembers(); }
        catch { throw sourceError(); }
        const source = await readHubstaffHrSource(members.map(member => member.id), month);
        const { rows } = await db.query('SELECT hubstaff_user_id, position FROM portal_internal_users');
        const portalAccounts = new Map(rows.map(row => [String(row.hubstaff_user_id), row.position]));
        const view = buildHrView(members, portalAccounts, source, month, new Date(),
          process.env.HUBSTAFF_TEAM_SCHEDULES_VERIFIED === 'true');
        await finishIntegrationRun(db, runId, { status: 'succeeded',
          recordsProcessed: members.length + source.recordsProcessed });
        return view;
      } catch (error) {
        try { await finishIntegrationRun(db, runId, { status: 'failed',
          errorCode: safeIntegrationErrorCode(error) }); } catch { /* Preserve the original read failure. */ }
        if (error instanceof InternalUserError) throw error;
        throw sourceError();
      }
    },
  });
  await auditInternalPanelReads(db, internalUser.user_id, visiblePanels);
  return hrViewForPanels(cached.value, visiblePanels, cached.freshness);
}
