export const connectionMessages = {
  connected: 'Your Hubstaff connection has been verified. Your assigned work is ready to load.',
  unlinked: 'Hubstaff has been unlinked from your portal account. You can reconnect it later.',
  invalid_token: 'Hubstaff could not use that personal token. Enter the fresh token shown when you create a PAT with Hubstaff and Tasks read scopes.',
  identity_mismatch: 'That token belongs to a different Hubstaff account. Contact an administrator to check your approved connection.',
  hubstaff_forbidden: 'Hubstaff denied access. Ask your administrator to check your read permissions and plan.',
  hubstaff_rate_limit: 'Hubstaff is busy. Please wait before trying again.',
  refresh_limited: 'Please wait 15 seconds before trying again.',
  connection_unavailable: 'Your connection needs administrator attention. Check that the internal user migration has been applied.',
  connection_changed: 'Your account connection changed. Reload and try again.',
  hubstaff_unavailable: 'Hubstaff is temporarily unavailable. Please try again shortly.',
  invalid_request: 'The connection form was invalid. Please try again.',
  panel_forbidden: 'Hubstaff connection access is not enabled for this internal user account.',
  oauth_not_configured: 'Hubstaff sign-in needs administrator setup. You can use the manual connection for now.',
  oauth_unavailable: 'Hubstaff sign-in is temporarily unavailable. Please try again.',
  oauth_expired: 'Hubstaff sign-in expired or your portal account changed. Start the connection again.',
  oauth_denied: 'Hubstaff sign-in was cancelled or not authorized. Try again when ready.',
};

export function dueState(task, now = new Date()) {
  if (task.done || !task.dueAt) return '';
  // Date-only deadlines stay due all day in the viewer's local calendar.
  const due = /^\d{4}-\d{2}-\d{2}$/.test(task.dueAt)
    ? new Date(`${task.dueAt}T23:59:59`) : new Date(task.dueAt);
  const remaining = due.valueOf() - now.valueOf();
  return remaining < 0 ? 'overdue' : remaining <= 3 * 86400000 ? 'soon' : '';
}

function taskDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function selectInternalUserTasks(tasks, {
  search = '', project = 'all', status = 'active', sort = 'created', direction = 'desc',
} = {}, now = new Date()) {
  const query = search.trim().toLowerCase();
  return tasks.filter(task => (!query || `${task.title} ${task.projectName}`.toLowerCase().includes(query))
    && (project === 'all' || task.projectId === project)
    && (status === 'all' || (status === 'active' && !task.done) || (status === 'done' && task.done)
      || (status === 'soon' && dueState(task, now) === 'soon')
      || (status === 'overdue' && dueState(task, now) === 'overdue')
      || (status === 'in_progress' && task.stage === 'in_progress' && !task.done)))
    .sort((a, b) => {
      const field = sort === 'due' ? 'dueAt' : sort === 'updated' ? 'updatedAt' : 'createdAt';
      const first = taskDate(a[field]);
      const second = taskDate(b[field]);
      if (first === null || second === null) {
        if (first === second) return a.title.localeCompare(b.title);
        return first === null ? 1 : -1;
      }
      const comparison = first - second;
      return (direction === 'asc' ? comparison : -comparison) || a.title.localeCompare(b.title);
    });
}
