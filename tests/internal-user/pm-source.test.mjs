import assert from 'node:assert/strict';
import test from 'node:test';

import { readHubstaffPmCatalog, readHubstaffPmProjectTasks } from '../../lib/internal-hubstaff-pm.js';

function source(overrides = {}) {
  const calls = [];
  const values = {
    '/api/v1/organizations': { organizations: [{ id: 14952, name: 'Always Open Commerce' }] },
    '/api/v1/organizations/14952/folders': { folders: [
      { id: 11, organization_id: 14952, name: 'Operations' },
    ] },
    '/api/v1/organizations/14952/projects': { projects: [
      { id: 20, organization_id: 14952, folder_id: 11, name: 'AOC Portal', archived: false },
      { id: 21, organization_id: 14952, folder_id: 999, name: 'Unfiled', archived: false },
    ] },
    '/api/v1/organizations/14952/members': { members: [{ id: 5, name: 'AOC Member', email: 'private@example.com' }] },
    '/api/v1/projects/20/tasks': { tasks: [{ id: 30, subject: 'Build portal', description: 'Private task body',
      list: { name: 'Doing', project_id: 20 }, assignee_ids: [5], done: false, status: 'open',
      due_on: '2026-11-01', due_at: null, updated_at: '2026-10-15T08:00:00Z' }] },
    ...overrides,
  };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, query: parsed.searchParams, auth: options.headers.Authorization });
    return Object.hasOwn(values, parsed.pathname)
      ? Response.json(values[parsed.pathname]) : Response.json({ error: 'missing' }, { status: 404 });
  };
  return { fetchImpl, calls };
}

test('PM reader loads one Tasks organization, preserving folders and projecting safe task fields', async () => {
  const { fetchImpl, calls } = source();
  const catalog = await readHubstaffPmCatalog('test-pat', { fetchImpl, configuredOrganizationId: '14952' });
  assert.equal(catalog.organizationId, '14952');
  assert.deepEqual(catalog.folders, [{ id: '11', name: 'Operations' }]);
  assert.deepEqual(catalog.projects, [
    { id: '20', folderId: '11', name: 'AOC Portal' },
    { id: '21', folderId: '999', name: 'Unfiled' },
  ]);
  assert.deepEqual(catalog.members, [{ id: '5', name: 'AOC Member' }]);
  assert.doesNotMatch(JSON.stringify(catalog), /private@example.com/);
  const result = await readHubstaffPmProjectTasks('test-pat', '20', { fetchImpl });
  assert.deepEqual(result, { truncated: false, tasks: [{ id: '30', title: 'Build portal',
    stage: 'Doing', status: 'open', done: false, assigneeIds: ['5'], dueOn: '2026-11-01',
    dueAt: null, updatedAt: '2026-10-15T08:00:00Z' }] });
  assert.doesNotMatch(JSON.stringify(result), /Private task body/);
  assert.equal(calls.find(call => call.path.endsWith('/projects')).query.get('status'), 'active');
  assert.equal(calls.find(call => call.path.endsWith('/tasks')).query.get('removed'), 'false');
  assert.equal(calls.every(call => call.auth === 'Bearer test-pat'), true);
});

test('PM reader fails closed on ambiguous organization, foreign project, or mismatched task', async () => {
  const ambiguous = source({ '/api/v1/organizations': { organizations: [
    { id: 14952, name: 'AOC' }, { id: 999, name: 'Other' },
  ] } });
  await assert.rejects(() => readHubstaffPmCatalog('test-pat', {
    fetchImpl: ambiguous.fetchImpl, configuredOrganizationId: '',
  }), error => error.publicDetails?.code === 'hubstaff_organization_ambiguous');
  const foreign = source({ '/api/v1/organizations/14952/projects': { projects: [
    { id: 20, organization_id: 999, name: 'Other project', archived: false },
  ] } });
  await assert.rejects(() => readHubstaffPmCatalog('test-pat', {
    fetchImpl: foreign.fetchImpl, configuredOrganizationId: '14952',
  }), error => error.publicDetails?.code === 'hubstaff_unavailable');
  const wrongTask = source({ '/api/v1/projects/20/tasks': { tasks: [{ id: 30, subject: 'Wrong',
    list: { project_id: 21 }, assignee_ids: [] }] } });
  await assert.rejects(() => readHubstaffPmProjectTasks('test-pat', '20', {
    fetchImpl: wrongTask.fetchImpl,
  }), error => error.publicDetails?.code === 'hubstaff_unavailable');
});
