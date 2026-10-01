export const testToken = 'fixture-personal-access-token-never-real';
export const employeeA = { user_id: '1', hubstaff_user_id: '101', role: 'employee', is_active: true, connection_version: '0', display_name: 'Fixture Employee A' };
export const employeeB = { ...employeeA, user_id: '2', hubstaff_user_id: '202', display_name: 'Fixture Employee B' };
export function task(overrides = {}) {
  return { id: 1, subject: 'Fix product layout', assignee_ids: [101], list_id: 10,
    list: { id: 10, project_id: 77, name: 'In Progress', type: 'normal' },
    done: false, due_on: '2026-10-01', updated_at: '2026-09-29T12:00:00Z', ...overrides };
}
export function hubstaffFixture({ userId = 101, memberId = userId, tasks = [task()], projects = [{ id: 77, name: 'Fixture project' }], status = 200 } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (status !== 200) return Response.json({ error: testToken }, { status });
    if (url.pathname === '/v2/users/me') return Response.json({ user: { id: userId, name: 'Fixture employee', email: 'private@example.invalid' } });
    if (url.pathname === '/api/v1/members/me') return Response.json({ member: { id: memberId, email: 'private@example.invalid' } });
    if (url.pathname === '/api/v1/projects') return Response.json({ projects });
    if (url.pathname === '/api/v1/tasks/my/assigned') return Response.json({ tasks });
    throw new Error('Unexpected fixture endpoint');
  } };
}
