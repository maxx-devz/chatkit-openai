import 'server-only';

import { InternalUserError } from './internal-user-errors.js';

const ORIGIN = 'https://tasks.hubstaff.com';
const PAGE_LIMIT = 100;
const MAX_CATALOG_PAGES = 20;
const MAX_TASK_PAGES = 10;

function unavailable() {
  return new InternalUserError('hubstaff_unavailable',
    'Project Management data could not be verified from Hubstaff Tasks. Please try again.');
}

function id(value) {
  const text = String(value ?? '');
  return /^[1-9][0-9]*$/.test(text) && Number.isSafeInteger(Number(text)) ? text : '';
}

function safeText(value, limit = 160) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
}

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function instant(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : null;
}

async function pages(path, field, token, fetchImpl, { maxPages = MAX_CATALOG_PAGES,
  allowTruncation = false, params = {} } = {}) {
  const items = [];
  const seen = new Set();
  let cursor = '';
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${ORIGIN}${path}`);
    url.searchParams.set('page_limit', String(PAGE_LIMIT));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (cursor) url.searchParams.set('page_start_id', cursor);
    let response;
    try {
      response = await fetchImpl(url, { headers: {
        Accept: 'application/json', Authorization: `Bearer ${token}`,
      }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    } catch { throw unavailable(); }
    if (!response.ok) throw unavailable();
    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload?.[field]) || payload[field].length > PAGE_LIMIT) throw unavailable();
    items.push(...payload[field]);
    const next = payload.pagination?.next_page_start_id;
    if (next === undefined || next === null || next === '') return { items, truncated: false };
    cursor = id(next);
    if (!cursor || seen.has(cursor) || !payload[field].length) throw unavailable();
    seen.add(cursor);
  }
  if (allowTruncation) return { items, truncated: true };
  throw unavailable();
}

export async function readHubstaffPmCatalog(token, { fetchImpl = fetch,
  configuredOrganizationId = process.env.HUBSTAFF_TASKS_ORGANIZATION_ID } = {}) {
  if (typeof token !== 'string' || !token) throw unavailable();
  const organizations = (await pages('/api/v1/organizations', 'organizations', token, fetchImpl)).items;
  const configuredId = configuredOrganizationId ? id(configuredOrganizationId) : '';
  if (configuredOrganizationId && !configuredId) throw unavailable();
  const organization = configuredId
    ? organizations.find(item => id(item.id) === configuredId)
    : organizations.length === 1 ? organizations[0] : null;
  if (!organization || !id(organization.id)) {
    throw new InternalUserError('hubstaff_organization_ambiguous',
      'Choose the AOC Hubstaff Tasks organization in server configuration.');
  }
  const organizationId = id(organization.id);
  const root = `/api/v1/organizations/${organizationId}`;
  const [folderPage, projectPage, memberPage] = await Promise.all([
    pages(`${root}/folders`, 'folders', token, fetchImpl),
    pages(`${root}/projects`, 'projects', token, fetchImpl, { params: { status: 'active' } }),
    pages(`${root}/members`, 'members', token, fetchImpl),
  ]);
  const folders = folderPage.items.map(folder => {
    if (id(folder?.organization_id) !== organizationId || !id(folder?.id)) throw unavailable();
    return { id: id(folder.id), name: safeText(folder.name) || 'Untitled folder' };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const projects = projectPage.items.map(project => {
    if (id(project?.organization_id) !== organizationId || !id(project?.id)
      || project.archived === true) throw unavailable();
    return { id: id(project.id), folderId: id(project.folder_id) || null,
      name: safeText(project.name) || 'Untitled project' };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const members = memberPage.items.map(member => {
    if (!id(member?.id)) throw unavailable();
    return { id: id(member.id), name: safeText(member.name) || 'Hubstaff member' };
  });
  if (new Set(projects.map(project => project.id)).size !== projects.length) throw unavailable();
  return { organizationId, organizationName: safeText(organization.name), folders, projects, members };
}

export async function readHubstaffPmProjectTasks(token, projectId, { fetchImpl = fetch } = {}) {
  if (typeof token !== 'string' || !token || !id(projectId)) throw unavailable();
  const result = await pages(`/api/v1/projects/${id(projectId)}/tasks`, 'tasks', token, fetchImpl,
    { maxPages: MAX_TASK_PAGES, allowTruncation: true, params: { removed: 'false' } });
  const tasks = result.items.map(task => {
    if (!id(task?.id) || id(task?.list?.project_id) !== id(projectId)
      || !Array.isArray(task.assignee_ids) || task.assignee_ids.length > 20) throw unavailable();
    const assigneeIds = task.assignee_ids.map(value => id(value));
    if (assigneeIds.some(value => !value)) throw unavailable();
    return { id: id(task.id), title: safeText(task.subject, 240) || 'Untitled task',
      stage: safeText(task.list?.name, 80), status: safeText(task.status, 32),
      done: task.done === true, assigneeIds, dueOn: date(task.due_on),
      dueAt: instant(task.due_at), updatedAt: instant(task.updated_at) };
  });
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw unavailable();
  return { tasks, truncated: result.truncated };
}
