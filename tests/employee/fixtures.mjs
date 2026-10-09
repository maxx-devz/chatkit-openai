export const testToken = 'fixture-personal-access-token-never-real';
export const employeeA = { user_id: '1', hubstaff_user_id: '101', role: 'employee', position: 'team_member',
  panel_access: ['overview', 'my_tasks', 'activity', 'hubstaff'], is_active: true,
  connection_version: '0', display_name: 'Fixture Employee A' };
export const employeeB = { ...employeeA, user_id: '2', hubstaff_user_id: '202', display_name: 'Fixture Employee B' };
export function task(overrides = {}) {
  return { id: 1, subject: 'Fix product layout', assignee_ids: [101], list_id: 10,
    list: { id: 10, project_id: 77, name: 'In Progress', type: 'normal' },
    description: 'Update the product page layout and verify the responsive states.',
    done: false, due_on: '2026-10-01', created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-29T12:00:00Z', ...overrides };
}
export function hubstaffFixture({ userId = 101, memberId = userId, timeZone = 'UTC', tasks = [task()],
  projects = [{ id: 77, name: 'Fixture project', organization_id: 9 }],
  organizations = [{ id: 9, name: 'Fixture organization', status: 'active' }], activities = [], labels = {}, comments = {}, members = {}, status = 200 } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (status !== 200) return Response.json({ error: testToken }, { status });
    if (url.pathname === '/v2/users/me') return Response.json({ user: { id: userId, name: 'Fixture employee',
      time_zone: timeZone, email: 'private@example.invalid' } });
    if (url.pathname === '/v2/organizations') return Response.json({ organizations });
    if (/^\/v2\/organizations\/[1-9][0-9]*\/activities$/.test(url.pathname)) return Response.json({ activities });
    if (url.pathname === '/api/v1/members/me') return Response.json({ member: { id: memberId, email: 'private@example.invalid' } });
    if (url.pathname === '/api/v1/projects') return Response.json({ projects });
    if (url.pathname === '/api/v1/tasks/my/assigned') return Response.json({ tasks });
    const singleTask = url.pathname.match(/^\/api\/v1\/tasks\/([1-9][0-9]*)$/)?.[1];
    if (singleTask) return Response.json({ task: tasks.find(item => String(item.id) === singleTask) || null });
    const memberProject = url.pathname.match(/^\/api\/v1\/projects\/([1-9][0-9]*)\/members$/)?.[1];
    if (memberProject) return Response.json({ members: members[memberProject] || [] });
    const commentTask = url.pathname.match(/^\/api\/v1\/tasks\/([1-9][0-9]*)\/comments$/)?.[1];
    if (commentTask) return Response.json({ comments: comments[commentTask] || [] });
    const labelProject = url.pathname.match(/^\/api\/v1\/projects\/([1-9][0-9]*)\/labels$/)?.[1];
    if (labelProject) return Response.json({ labels: labels[labelProject] || [] });
    throw new Error('Unexpected fixture endpoint');
  } };
}
