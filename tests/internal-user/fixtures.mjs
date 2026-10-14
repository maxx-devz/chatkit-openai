export const testToken = 'fixture-personal-access-token-never-real';
export const internalUserA = { user_id: '1', hubstaff_user_id: '101', account_type: 'internal_user', position: 'team_member',
  panel_access: ['overview', 'my_tasks', 'activity', 'team_directory', 'hubstaff'], is_active: true,
  connection_version: '0', display_name: 'Fixture Internal User A' };
export const internalUserB = { ...internalUserA, user_id: '2', hubstaff_user_id: '202', display_name: 'Fixture Internal User B' };
export function task(overrides = {}) {
  return { id: 1, subject: 'Fix product layout', assignee_ids: [101], list_id: 10,
    list: { id: 10, project_id: 77, name: 'In Progress', type: 'normal' },
    description: 'Update the product page layout and verify the responsive states.',
    done: false, due_on: '2026-10-01', created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-29T12:00:00Z', ...overrides };
}
export function hubstaffFixture({ userId = 101, memberId = userId, timeZone = 'UTC', tasks = [task()],
  projects = [{ id: 77, name: 'Fixture project', organization_id: 9 }],
  organizations = [{ id: 9, name: 'Fixture organization', status: 'active' }], activities = [], labels = {}, status = 200 } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (status !== 200) return Response.json({ error: testToken }, { status });
    if (url.pathname === '/v2/users/me') return Response.json({ user: { id: userId, name: 'Fixture internal user',
      time_zone: timeZone, email: 'private@example.invalid' } });
    if (url.pathname === '/v2/organizations') return Response.json({ organizations });
    if (/^\/v2\/organizations\/[1-9][0-9]*\/activities$/.test(url.pathname)) return Response.json({ activities });
    if (url.pathname === '/api/v1/members/me') return Response.json({ member: { id: memberId, email: 'private@example.invalid' } });
    if (url.pathname === '/api/v1/projects') return Response.json({ projects });
    if (url.pathname === '/api/v1/tasks/my/assigned') return Response.json({ tasks });
    const labelProject = url.pathname.match(/^\/api\/v1\/projects\/([1-9][0-9]*)\/labels$/)?.[1];
    if (labelProject) return Response.json({ labels: labels[labelProject] || [] });
    throw new Error('Unexpected fixture endpoint');
  } };
}
