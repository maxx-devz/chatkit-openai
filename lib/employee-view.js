export const connectionMessages = {
  connected: 'Your Hubstaff connection has been verified. Your assigned work is ready to load.',
  invalid_token: 'Hubstaff could not use that personal token. Enter the fresh token shown when you create a PAT with Hubstaff and Tasks read scopes.',
  identity_mismatch: 'That token belongs to a different Hubstaff account. Contact an administrator to check your approved connection.',
  hubstaff_forbidden: 'Hubstaff denied access. Ask your administrator to check your read permissions and plan.',
  hubstaff_rate_limit: 'Hubstaff is busy. Please wait before trying again.',
  refresh_limited: 'Please wait 15 seconds before trying again.',
  connection_unavailable: 'Your connection needs administrator attention. Check that the employee migration has been applied.',
  connection_changed: 'Your account connection changed. Reload and try again.',
  hubstaff_unavailable: 'Hubstaff is temporarily unavailable. Please try again shortly.',
  invalid_request: 'The connection form was invalid. Please try again.',
};

export function dueState(task, now = new Date()) {
  if (task.done || !task.dueAt) return '';
  // Date-only deadlines stay due all day in the viewer's local calendar.
  const due = /^\d{4}-\d{2}-\d{2}$/.test(task.dueAt)
    ? new Date(`${task.dueAt}T23:59:59`) : new Date(task.dueAt);
  const remaining = due.valueOf() - now.valueOf();
  return remaining < 0 ? 'overdue' : remaining <= 3 * 86400000 ? 'soon' : '';
}

export function selectEmployeeTasks(tasks, { search = '', project = 'all', status = 'active', sort = 'due' } = {}, now = new Date()) {
  const query = search.trim().toLowerCase();
  return tasks.filter(task => (!query || `${task.title} ${task.projectName}`.toLowerCase().includes(query))
    && (project === 'all' || task.projectId === project)
    && (status === 'all' || (status === 'active' && !task.done) || (status === 'done' && task.done)
      || (status === 'soon' && dueState(task, now) === 'soon')
      || (status === 'overdue' && dueState(task, now) === 'overdue')
      || (status === 'in_progress' && task.stage === 'in_progress' && !task.done)))
    .sort((a, b) => sort === 'recent'
      ? (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
      : (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity) || a.title.localeCompare(b.title));
}
