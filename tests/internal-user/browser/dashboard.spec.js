import { test, expect } from '@playwright/test';

function fixture() {
  const due = new Date(Date.now() + 86400000).toISOString();
  const old = new Date(Date.now() - 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const weekStartDate = new Date(`${today}T12:00:00Z`);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - ((weekStartDate.getUTCDay() + 6) % 7));
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  return { connection: { connected: true, name: 'Fixture Internal User' }, syncedAt: new Date().toISOString(),
    projects: [{ id: '77', name: 'Shop Alpha' }, { id: '88', name: 'Shop Beta' }], tasks: [
      { id: '1', title: 'Fix PDP layout', description: 'Correct the mobile product layout and verify its responsive states.', href: 'https://tasks.hubstaff.com/app/organizations/9/projects/77/tasks/1', projectId: '77', projectName: 'Shop Alpha', status: 'In Progress', stage: 'in_progress', done: false, dueAt: due, createdAt: new Date().toISOString(), updatedAt: old, priority: { name: 'High Priority', level: 'high' } },
      { id: '2', title: 'Update product import', description: 'Review the latest catalog import and resolve rejected product rows.', href: 'https://tasks.hubstaff.com/app/organizations/9/projects/88/tasks/2', projectId: '88', projectName: 'Shop Beta', status: 'Assigned', stage: 'other', done: false, dueAt: old, createdAt: old, updatedAt: old },
      { id: '3', title: 'Accessibility QA', projectId: '77', projectName: 'Shop Alpha', status: 'Done', stage: 'done', done: true, createdAt: old, completedAt: old, updatedAt: old },
    ], workSummary: { timeAvailable: true, timePartial: false, timeZone: 'UTC',
      today: { date: today, trackedHours: 2.5, activityRate: 64 },
      week: { start: weekStart, stop: today, trackedHours: 17.75, activityRate: 67 } } };
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 800, height: 900 }, { width: 390, height: 844 }]) {
  test(`assigned tasks, filtering and responsive layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: fixture() }));
    await page.goto('/');
    const internalUserNav = page.locator('nav[aria-label="Internal portal"]');
    if (viewport.width > 720) {
      await expect(internalUserNav).toBeVisible();
      await expect(internalUserNav.getByRole('link')).toHaveText(['My Work', 'Team', 'Settings']);
      if (viewport.width <= 900) await expect(internalUserNav.getByText('My Work')).toBeHidden();
    } else {
      await expect(internalUserNav).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
      await expect(page.getByRole('banner').getByText('My Work', { exact: true })).toBeVisible();
    }
    const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
    await expect(assigned.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
    await expect(assigned.getByLabel('Priority: High Priority')).toBeVisible();
    await expect(assigned.getByRole('heading', { name: 'Accessibility QA' })).toHaveCount(0);
    await expect(page.getByLabel('Project', { exact: true }).locator('option')).toHaveText([
      'All projects (2)', 'Shop Alpha (1)', 'Shop Beta (1)',
    ]);
    await expect(page.getByLabel('Sort', { exact: true })).toHaveValue('created');
    await expect(page.getByLabel('Sort', { exact: true }).locator('option')).toHaveText(['Created date', 'Updated date', 'Due date']);
    await expect(page.getByLabel('Sort direction')).toHaveValue('desc');
    await expect(page.getByLabel('Sort direction').locator('option')).toHaveText(['Descending', 'Ascending']);
    await expect(page.getByRole('heading', { name: 'My projects & workload' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Time & Activity' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This Week', exact: true })).toBeVisible();
    await expect(page.getByText('Worked Time', { exact: true })).toBeVisible();
    await expect(page.getByText('Avg. Activity', { exact: true })).toBeVisible();
    await expect(page.getByText('Worked this Week', { exact: true })).toBeVisible();
    await expect(page.getByText('Weekly Activity', { exact: true })).toBeVisible();
    await expect(page.getByText('64%', { exact: true })).toBeVisible();
    await expect(page.getByText('67%', { exact: true })).toBeVisible();
    await expect(page.getByText('2.5h', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
    await expect(page.locator('main aside h2')).toHaveText(['To Do']);
    await expect(page.getByRole('heading', { name: 'Recent task activity' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recently completed' })).toBeVisible();
    const panelPositions = await page.getByRole('heading', { name: /My Assigned Tasks|Recent task activity|Recently completed/ })
      .evaluateAll(headings => Object.fromEntries(headings.map(heading => {
        const panel = heading.closest('section');
        return [heading.textContent, panel.getBoundingClientRect().top + window.scrollY];
      })));
    expect(panelPositions['Recent task activity']).toBeGreaterThan(panelPositions['My Assigned Tasks']);
    expect(panelPositions['Recently completed']).toBeGreaterThan(panelPositions['My Assigned Tasks']);
    const overdueTask = assigned.getByRole('listitem').filter({ hasText: 'Update product import' });
    await expect(overdueTask.getByText('Overdue', { exact: true })).toBeVisible();
    await expect(overdueTask.getByLabel(/Due date: Overdue,/)).toBeVisible();
    await page.getByRole('region', { name: 'Needs attention' }).getByRole('link', { name: 'Review' }).first().click();
    const details = assigned.getByRole('region', { name: 'Update product import details' });
    await expect(details).toContainText('resolve rejected product rows');
    await expect(details).toContainText('Created');
    await expect(details).toContainText('Updated');
    await expect(details.getByRole('link', { name: /Open in Hubstaff/ })).toHaveAttribute('href', 'https://tasks.hubstaff.com/app/organizations/9/projects/88/tasks/2');
    const overdueCard = page.getByRole('button', { name: /Overdue 1 View tasks/ });
    await expect(overdueCard).toBeVisible();
    await overdueCard.click();
    await expect(assigned.getByRole('heading', { name: 'Fix PDP layout' })).toHaveCount(0);
    await expect(assigned.getByRole('heading', { name: 'Update product import' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/internal-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel('Search tasks', { exact: true }).fill('product');
    await expect(assigned.getByRole('heading', { name: 'Fix PDP layout' })).toHaveCount(0);
    await expect(assigned.getByRole('heading', { name: 'Update product import' })).toBeVisible();
    await page.getByLabel('Search tasks', { exact: true }).fill('');
    await page.getByLabel('Project', { exact: true }).selectOption('77');
    await expect(assigned.getByRole('heading', { name: 'Update product import' })).toHaveCount(0);
    await page.getByLabel('Status', { exact: true }).selectOption('done');
    const completedTask = assigned.getByRole('listitem').filter({ hasText: 'Accessibility QA' });
    await expect(completedTask.getByRole('heading', { name: 'Accessibility QA' })).toBeVisible();
    await expect(completedTask.getByText('No due date', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Refresh Hubstaff data/ })).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });
}

test('basic Team directory is available without a management role or private status', async ({ page }) => {
  const data = { ...fixture(), teamMembers: [
    { id: '1', name: 'Fixture Internal User', position: 'Project Manager', connected: true },
    { id: '2', name: 'Taylor Team', position: 'Team Member', connected: false },
  ] };
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: data }));
  await page.goto('/team-basic');
  const internalUserNav = page.locator('nav[aria-label="Internal portal"]');
  await expect(internalUserNav.getByRole('link')).toHaveText(['My Work', 'Team', 'Settings']);
  await expect(page.getByRole('heading', { name: 'My Assigned Tasks' })).toHaveCount(0);
  const directory = page.locator('#team-directory');
  await expect(directory.getByRole('heading', { name: 'Team directory' })).toBeVisible();
  await expect(directory.getByText('Taylor Team')).toBeVisible();
  await expect(directory.getByText('Setup needed')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Team tasks' })).toHaveCount(0);
});

test('workspace navigation reuses loaded data and keeps Hubstaff refresh in the shared header', async ({ page }) => {
  const requests = { personal: 0, team: 0, settings: 0 };
  await page.route('**/api/internal/dashboard**', route => {
    const workspace = new URL(route.request().url()).searchParams.get('workspace') || 'personal';
    requests[workspace] += 1;
    return route.fulfill({ json: { ...fixture(), teamMembers: [
      { id: '1', name: 'Fixture Internal User', position: 'Project Manager', connected: true },
    ] } });
  });

  await page.goto('/internal');
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
  expect(requests.personal).toBe(1);

  const internalUserNav = page.locator('nav[aria-label="Internal portal"]');
  await internalUserNav.getByRole('link', { name: 'Team' }).click();
  const directory = page.locator('#team-directory');
  await expect(directory.getByText('Fixture Internal User')).toBeVisible();
  await expect.poll(() => requests.team).toBe(1);
  const refresh = page.getByRole('banner').getByRole('button', { name: 'Refresh Hubstaff data' });
  await expect(refresh).toBeVisible();
  await refresh.click();
  await expect(page.getByRole('banner').getByText('Hubstaff data updated.')).toBeVisible();
  expect(requests.personal).toBe(2);

  await internalUserNav.getByRole('link', { name: 'My Work' }).click();
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
  expect(requests.personal).toBe(2);

  await internalUserNav.getByRole('link', { name: 'Team' }).click();
  await expect(directory.getByText('Fixture Internal User')).toBeVisible();
  await page.waitForTimeout(100);
  expect(requests.team).toBe(1);

  await internalUserNav.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Hubstaff connection' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Refresh Hubstaff data' })).toBeVisible();
  await expect.poll(() => requests.settings).toBe(1);
});

test('workflow statuses have distinct badge treatments', async ({ page }) => {
  const data = fixture();
  const base = data.tasks[0];
  data.tasks = [
    { ...base, id: 'todo', title: 'Todo task', status: 'To Do', stage: 'todo', done: false },
    { ...base, id: 'progress', title: 'Progress task', status: 'In Progress', stage: 'in_progress', done: false },
    { ...base, id: 'done', title: 'Done task', status: 'Complete', stage: 'done', done: true },
    { ...base, id: 'review', title: 'Review task', status: 'Client Review', stage: 'review', done: false },
  ];
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: data }));
  await page.goto('/');
  await page.getByLabel('Status', { exact: true }).selectOption('all');
  const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
  const badges = await Promise.all([
    ['Todo task', 'To Do'], ['Progress task', 'In Progress'], ['Done task', 'Complete'], ['Review task', 'Client Review'],
  ].map(async ([title, status]) => assigned.getByRole('listitem').filter({ hasText: title }).getByText(status, { exact: true })
    .evaluate(element => {
      const style = getComputedStyle(element);
      return `${style.color}|${style.backgroundColor}|${style.borderColor}`;
    })));
  expect(new Set(badges).size).toBe(4);
});

test('urgent active tasks appear in Needs attention without requiring a due date', async ({ page }) => {
  const data = fixture();
  const base = data.tasks[0];
  data.tasks = [
    { ...base, id: 'urgent', title: 'Urgent undated task', dueAt: '', priority: { name: 'Urgent', level: 'urgent' } },
    { ...base, id: 'regular', title: 'Regular undated task', dueAt: '', priority: { name: 'High Priority', level: 'high' } },
    { ...base, id: 'completed-urgent', title: 'Completed urgent task', dueAt: '', done: true, stage: 'done', priority: { name: 'Urgent', level: 'urgent' } },
  ];
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: data }));
  await page.goto('/');
  const attention = page.getByRole('region', { name: 'Needs attention' });
  await expect(attention.getByText('Urgent undated task', { exact: true })).toBeVisible();
  await expect(attention.getByText('Shop Alpha · Urgent', { exact: true })).toBeVisible();
  await expect(attention.getByText('Regular undated task', { exact: true })).toHaveCount(0);
  await expect(attention.getByText('Completed urgent task', { exact: true })).toHaveCount(0);
});

test('loading, empty and safe error states work without showing stale task data', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/internal/dashboard**', async route => { await gate; await route.fulfill({ json: fixture() }); });
  await page.goto('/');
  await expect(page.getByText('Loading your assigned tasks')).toBeAttached();
  release();
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
  await page.unroute('**/api/internal/dashboard**');
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ status: 400, json: { error: 'Your Hubstaff access token is invalid or expired. Please reconnect.' } }));
  await page.getByRole('button', { name: 'Refresh Hubstaff data' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or expired');
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toHaveCount(0);
  await page.unroute('**/api/internal/dashboard**');
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: { ...fixture(), tasks: [] } }));
  await page.getByRole('button', { name: 'Refresh Hubstaff data' }).click();
  await expect(page.getByRole('heading', { name: 'No assigned tasks yet' })).toBeVisible();
});

test('assigned tasks are paginated and filters return to the first page', async ({ page }) => {
  const tasks = Array.from({ length: 35 }, (_, index) => ({
    id: String(index + 1), title: `Task ${String(index + 1).padStart(2, '0')}`,
    projectId: '77', projectName: 'Shop Alpha', status: 'Assigned', stage: 'other', done: false,
    dueAt: new Date(Date.now() + (index + 4) * 86400000).toISOString(),
    createdAt: new Date(Date.now() - index * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  }));
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: { ...fixture(), tasks } }));
  await page.goto('/');
  const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
  await expect(assigned.getByText('Showing 1-10 of 35 matching tasks')).toBeVisible();
  await expect(assigned.getByRole('heading', { name: 'Task 01' })).toBeVisible();
  await expect(assigned.getByRole('heading', { name: 'Task 11' })).toHaveCount(0);
  await page.getByLabel('Tasks per page').selectOption('30');
  await expect(assigned.getByText('Showing 1-30 of 35 matching tasks')).toBeVisible();
  await expect(assigned.getByText('Page 1 of 2')).toBeVisible();
  await expect(assigned.getByRole('heading', { name: 'Task 30' })).toBeVisible();
  await expect(assigned.getByRole('heading', { name: 'Task 31' })).toHaveCount(0);
  await assigned.getByRole('button', { name: 'Next' }).click();
  await expect(assigned.getByText('Page 2 of 2')).toBeVisible();
  await expect(assigned.getByRole('heading', { name: 'Task 01' })).toHaveCount(0);
  await expect(assigned.getByRole('heading', { name: 'Task 31' })).toBeVisible();
  await page.getByLabel('Search tasks', { exact: true }).fill('Task 35');
  await expect(assigned.getByText('Showing 1-1 of 1 matching tasks')).toBeVisible();
  await expect(assigned.getByRole('heading', { name: 'Task 35' })).toBeVisible();
  await expect(assigned.getByRole('navigation', { name: 'Assigned task pages' })).toHaveCount(0);
  await page.getByLabel('Search tasks', { exact: true }).fill('');
  await page.getByLabel('Tasks per page').selectOption('50');
  await expect(assigned.getByText('Showing 1-35 of 35 matching tasks')).toBeVisible();
  await expect(assigned.getByRole('navigation', { name: 'Assigned task pages' })).toHaveCount(0);
});

test('today plan supports drag, sequencing, focus, local completion, persistence, and clearing', async ({ page }) => {
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: fixture() }));
  await page.goto('/');
  const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
  const todayPlan = page.getByRole('region', { name: 'To Do' });
  await expect(todayPlan.getByText('Build today’s sequence')).toBeVisible();

  await assigned.getByRole('listitem').filter({ hasText: 'Fix PDP layout' }).dragTo(todayPlan);
  await expect(todayPlan.getByText('Fix PDP layout', { exact: true })).toBeVisible();
  await expect(assigned.getByRole('button', { name: 'In today’s plan' })).toBeDisabled();

  await assigned.getByRole('listitem').filter({ hasText: 'Update product import' })
    .getByRole('button', { name: 'Add to today’s plan' }).click();
  await expect(todayPlan.locator('ol > li')).toHaveText([/Fix PDP layout/, /Update product import/]);
  await todayPlan.getByRole('button', { name: 'Move Update product import up' }).click();
  await expect(todayPlan.locator('ol > li')).toHaveText([/Update product import/, /Fix PDP layout/]);
  await todayPlan.getByRole('button', { name: 'Start working on Update product import' }).click();
  await expect(todayPlan.getByRole('button', { name: 'Stop working on Update product import' })).toHaveText('Working now');
  await todayPlan.getByRole('button', { name: 'Mark Fix PDP layout done today' }).click();
  await expect(todayPlan.locator('ol > li')).toHaveText([/Update product import/]);
  const doneToday = todayPlan.getByRole('region', { name: 'Done today' });
  await expect(doneToday.getByText('Fix PDP layout', { exact: true })).toBeVisible();

  await page.reload();
  await expect(todayPlan.locator('ol > li')).toHaveText([/Update product import/]);
  await expect(todayPlan.getByRole('button', { name: 'Stop working on Update product import' })).toBeVisible();
  await expect(doneToday.getByText('Fix PDP layout', { exact: true })).toBeVisible();
  await doneToday.getByRole('button', { name: 'Undo' }).click();
  await expect(todayPlan.locator('ol > li')).toHaveText([/Update product import/, /Fix PDP layout/]);
  await todayPlan.getByRole('button', { name: 'Clear plan' }).click();
  await expect(todayPlan.getByText('Build today’s sequence')).toBeVisible();
  await expect(todayPlan.getByRole('region', { name: 'Done today' })).toHaveCount(0);
  await page.reload();
  await expect(todayPlan.getByText('Build today’s sequence')).toBeVisible();
});

test('today plan offers unfinished tasks from yesterday once', async ({ page }) => {
  await page.addInitScript(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    localStorage.setItem(`aoc-employee-today-plan:${encodeURIComponent('Fixture Internal User')}:${dateKey}`, JSON.stringify({
      taskIds: ['1', '2'], workingTaskId: '1', completedTaskIds: [], carryOverHandled: false,
    }));
  });
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: fixture() }));
  await page.goto('/');
  const todayPlan = page.getByRole('region', { name: 'To Do' });
  await expect(todayPlan.getByText('Continue yesterday’s plan?')).toBeVisible();
  await expect(todayPlan.getByText('2 unfinished tasks are still available.')).toBeVisible();
  await todayPlan.getByRole('button', { name: 'Add to today’s plan' }).click();
  await expect(todayPlan.locator('ol > li')).toHaveText([/Fix PDP layout/, /Update product import/]);
  await expect(todayPlan.getByText('Continue yesterday’s plan?')).toHaveCount(0);
  await page.reload();
  await expect(todayPlan.locator('ol > li')).toHaveText([/Fix PDP layout/, /Update product import/]);
  await expect(todayPlan.getByText('Continue yesterday’s plan?')).toHaveCount(0);
});

test('token entry is a native password POST with no browser storage or URL token', async ({ page }) => {
  await page.route('**/api/internal/dashboard**', route => route.fulfill({ json: {
    connection: { connected: false }, tasks: [], projects: [], teamMembers: [], syncedAt: null,
  } }));
  await page.goto('/internal/settings?connected=false');
  await expect(page.getByRole('heading', { name: 'My Assigned Tasks' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Hubstaff connection' })).toBeVisible();
  const input = page.getByLabel('Personal access token', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  const synthetic = 'browser-fixture-token-not-a-real-credential';
  await input.fill(synthetic);
  await page.route('**/api/internal/connection', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().url()).not.toContain(synthetic);
    expect(new URLSearchParams(route.request().postData()).get('token')).toBe(synthetic);
    await route.fulfill({ status: 303, headers: { location: '/internal/settings?connected=false' } });
  });
  await page.getByRole('button', { name: 'Validate and connect' }).click();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(synthetic);
  expect(await page.content()).not.toContain(synthetic);
});

test('Internal Settings can toggle Team and shows planned permissions without exposing the protected role', async ({ page }) => {
  await page.goto('/role-settings');
  await expect(page.getByRole('heading', { name: 'My Workspace & permissions' })).toBeVisible();
  await expect(page.getByText('internal_admin')).toHaveCount(0);
  await expect(page.getByText('Your account status remains protected.')).toBeVisible();
  await page.getByRole('button', { name: /Taylor Team/ }).click();
  const teamDirectoryPanel = page.getByRole('checkbox', { name: /Team directory/ });
  await expect(teamDirectoryPanel).not.toBeChecked();
  const accountSettingsPanel = page.getByRole('checkbox', { name: /Account settings/ });
  await expect(accountSettingsPanel).toBeChecked();
  await accountSettingsPanel.click();
  await expect(accountSettingsPanel).not.toBeChecked();
  await accountSettingsPanel.click();
  await expect(accountSettingsPanel).toBeChecked();
  await expect(teamDirectoryPanel).toBeEnabled();
  await teamDirectoryPanel.click();
  await expect(teamDirectoryPanel).toBeChecked();
  await teamDirectoryPanel.click();
  await expect(teamDirectoryPanel).not.toBeChecked();
  const roleCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'My Workspace & permissions' }) }).last();
  const hr = roleCard.getByRole('checkbox', { name: /HR · Planned/ });
  const accessManager = roleCard.getByRole('checkbox', { name: /Internal Access Manager/ });
  await expect(roleCard).not.toContainText('Internal Admin');
  await expect(hr).not.toBeChecked();
  await expect(accessManager).toBeEnabled();
  await expect(roleCard.getByText('people.leave.read')).toBeVisible();
  await expect(roleCard.locator('code').filter({ hasText: 'people.leave.read' })).toHaveCount(0);
  const roleCardTop = await roleCard.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
  const assignments = [];
  await page.route('**/api/internal/internal-users', async route => {
    expect(route.request().method()).toBe('PUT');
    const assignment = route.request().postDataJSON();
    expect(assignment).toEqual({ id: '2', role: 'hr', assigned: assignments.length === 0 });
    assignments.push(assignment);
    await route.fulfill({ json: { saved: true, internalUser: {
      id: '2', roles: assignment.assigned ? ['project_management', 'hr'] : ['project_management'],
    } } });
  });
  await hr.click();
  await expect(hr).toBeChecked();
  await expect(roleCard.locator('code').filter({ hasText: 'people.leave.read' })).toHaveCount(0);
  const roleToast = page.getByRole('status').filter({ hasText: 'Role granted to Taylor Team.' });
  await expect(roleToast).toBeVisible();
  await expect(roleToast).toHaveCSS('position', 'fixed');
  expect(await roleCard.evaluate(element => element.getBoundingClientRect().top + window.scrollY)).toBe(roleCardTop);
  await hr.click();
  await expect(hr).not.toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Role revoked from Taylor Team.' })).toBeVisible();
  expect(await roleCard.evaluate(element => element.getBoundingClientRect().top + window.scrollY)).toBe(roleCardTop);
  await expect(page.getByText('Any other account edits remain unsaved.')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Role revoked from Taylor Team.' })).toHaveCount(0, { timeout: 6000 });
});

test('Internal Admin can grant Internal Access Manager to another account', async ({ page }) => {
  await page.goto('/role-settings');
  await page.getByRole('button', { name: /Taylor Team/ }).click();
  const roleCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'My Workspace & permissions' }) }).last();
  const manager = roleCard.getByRole('checkbox', { name: /Internal Access Manager/ });
  await expect(manager).toBeEnabled();
  await expect(manager).not.toBeChecked();
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/internal/internal-users', async route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({ id: '2', role: 'internal_access_manager', assigned: true });
    await route.fulfill({ json: { internalUser: {
      id: '2', roles: ['project_management', 'internal_access_manager'],
    } } });
  });
  await manager.click();
  await expect(manager).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Role granted to Taylor Team.' })).toBeVisible();
});

test('Access Manager may change own business role but not own protected role in Internal Settings', async ({ page }) => {
  await page.goto('/role-settings?viewer=manager');
  const roleCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'My Workspace & permissions' }) }).last();
  const manager = roleCard.getByRole('checkbox', { name: /Internal Access Manager/ });
  const hr = roleCard.getByRole('checkbox', { name: /HR · Planned/ });
  await expect(manager).toBeChecked();
  await expect(manager).toBeDisabled();
  await expect(hr).toBeEnabled();
  await expect(page.getByText('You can manage your own business roles here, but not your account details or protected role.')).toBeVisible();
  await page.route('**/api/internal/internal-users', async route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({ id: '1', role: 'hr', assigned: true });
    await route.fulfill({ json: { internalUser: { id: '1', roles: ['internal_access_manager', 'hr'] } } });
  });
  await hr.click();
  await expect(hr).toBeChecked();
  await page.getByRole('button', { name: /Taylor Team/ }).click();
  await expect(manager).toBeDisabled();
  await expect(hr).toBeEnabled();
});

test('Internal Settings saves an enabled Team panel for an ordinary internal user', async ({ page }) => {
  await page.goto('/role-settings');
  await page.getByRole('button', { name: /Taylor Team/ }).click();
  const teamDirectoryPanel = page.getByRole('checkbox', { name: /Team directory/ });
  await expect(teamDirectoryPanel).not.toBeChecked();
  await teamDirectoryPanel.click();
  await page.route('**/api/internal/internal-users', async route => {
    expect(route.request().method()).toBe('PATCH');
    const submitted = route.request().postDataJSON();
    expect(submitted.id).toBe('2');
    expect(submitted.panelAccess).toContain('team_directory');
    await route.fulfill({ json: { internalUser: {
      id: '2', username: 'fixture.target', name: 'Taylor Team', position: 'team_member',
      positionLabel: 'Team Member', panelAccess: submitted.panelAccess,
      roles: ['project_management'], active: true, hubstaffUserId: '202', connected: false,
      createdAt: '2026-01-01T00:00:00Z',
    } } });
  });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Internal user controls saved successfully.')).toBeVisible();
  await expect(teamDirectoryPanel).toBeChecked();
});

test('Internal Settings creates an account using an available Hubstaff member', async ({ page }) => {
  await page.route('**/api/internal/hubstaff-members', route => route.fulfill({ json: {
    members: [{ id: '303', name: 'Avery Available' }, { id: '404', name: 'Taylor Available' }],
  } }));
  await page.goto('/role-settings');
  await page.getByRole('button', { name: 'Add internal user' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status').filter({ hasText: 'AOC members' })).toContainText('2 available');
  await expect(dialog.getByRole('combobox', { name: 'Hubstaff member' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Create internal user' })).toBeDisabled();
  await expect(dialog.getByRole('searchbox')).toHaveCount(0);
  await expect(dialog.getByRole('option', { name: 'Taylor Available (ID 404)' })).toHaveCount(1);
  await dialog.getByRole('combobox', { name: 'Hubstaff member' }).selectOption('303');
  await dialog.getByRole('textbox', { name: 'Internal user name' }).fill('Avery Available');
  await dialog.getByRole('textbox', { name: 'Username' }).fill('avery.available');
  await expect(dialog.getByText(/Use 12–128 characters and at least three/)).toBeVisible();
  await dialog.getByLabel('Temporary password').fill('justlowercaseletters');
  await dialog.getByLabel('Temporary password').blur();
  await expect(dialog.getByRole('alert')).toHaveText('Use at least three of: lowercase letters, uppercase letters, numbers, and symbols.');
  await expect(dialog.getByLabel('Temporary password')).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByLabel('Temporary password').fill('FixturePassword123!');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByLabel('Temporary password')).toHaveAttribute('aria-invalid', 'false');
  await page.route('**/api/internal/internal-users', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON().hubstaffUserId).toBe('303');
    await route.fulfill({ json: { internalUser: {
      id: '3', username: 'avery.available', name: 'Avery Available', position: 'team_member',
      positionLabel: 'Team Member', panelAccess: ['overview'], roles: [], active: true,
      hubstaffUserId: '303', connected: false, createdAt: '2026-01-01T00:00:00Z',
    } } });
  });
  await dialog.getByRole('button', { name: 'Create internal user' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Avery Available was created and can sign in now.')).toBeVisible();
});

test('Internal Settings AOC Members toggle permits an unmapped organization member', async ({ page }) => {
  await page.route('**/api/internal/hubstaff-members*', route => {
    const allOrganization = new URL(route.request().url()).searchParams.get('aoc_only') === 'false';
    return route.fulfill({ json: { members: allOrganization
      ? [{ id: '303', name: 'Avery AOC' }, { id: '505', name: 'Jordan Organization' }]
      : [{ id: '303', name: 'Avery AOC' }] } });
  });
  await page.goto('/role-settings');
  await page.getByRole('button', { name: 'Add internal user' }).click();
  const dialog = page.getByRole('dialog');
  const aocToggle = dialog.getByRole('switch', { name: /AOC Members/ });
  await expect(aocToggle).toBeChecked();
  await expect(dialog.getByRole('option', { name: 'Jordan Organization (ID 505)' })).toHaveCount(0);
  await aocToggle.uncheck();
  await expect(dialog.getByRole('status').filter({ hasText: 'Organization members' })).toContainText('2 available');
  await dialog.getByRole('combobox', { name: 'Hubstaff member' }).selectOption('505');
  await dialog.getByRole('textbox', { name: 'Internal user name' }).fill('Jordan Organization');
  await dialog.getByRole('textbox', { name: 'Username' }).fill('jordan.organization');
  await dialog.getByLabel('Temporary password').fill('FixturePassword123!');
  await page.route('**/api/internal/internal-users', async route => {
    const submitted = route.request().postDataJSON();
    expect(submitted.hubstaffUserId).toBe('505');
    await route.fulfill({ json: { internalUser: {
      id: '5', username: 'jordan.organization', name: 'Jordan Organization', position: 'team_member',
      positionLabel: 'Team Member', panelAccess: ['overview'], roles: [], active: true,
      hubstaffUserId: '505', connected: false, createdAt: '2026-01-01T00:00:00Z',
    } } });
  });
  await dialog.getByRole('button', { name: 'Create internal user' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Jordan Organization was created and can sign in now.')).toBeVisible();
});

test('Internal Settings shows a server password rejection beside the password field', async ({ page }) => {
  await page.route('**/api/internal/hubstaff-members', route => route.fulfill({ json: {
    members: [{ id: '303', name: 'Avery Available' }],
  } }));
  await page.route('**/api/internal/internal-users', route => route.fulfill({ status: 400, json: {
    code: 'invalid_password', error: 'Passwords must not contain the account username.',
  } }));
  await page.goto('/role-settings');
  await page.getByRole('button', { name: 'Add internal user' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Internal user name' }).fill('Avery Available');
  await dialog.getByRole('textbox', { name: 'Username' }).fill('avery.available');
  await dialog.getByLabel('Temporary password').fill('FixturePassword123!');
  await dialog.getByRole('combobox', { name: 'Hubstaff member' }).selectOption('303');
  await dialog.getByRole('button', { name: 'Create internal user' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Passwords must not contain the account username.');
  await expect(dialog.getByLabel('Temporary password')).toBeFocused();
  await expect(dialog.getByLabel('Temporary password')).toHaveAttribute('aria-invalid', 'true');
});

test('personal Settings can change the password without a Hubstaff panel', async ({ page }) => {
  await page.goto('/internal/settings?no_hubstaff=true');
  await expect(page.getByRole('heading', { name: 'Account security' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hubstaff connection' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  const form = page.locator('#account-security form');
  await form.getByLabel('Current password').fill('FixtureOld123!');
  await form.getByLabel('New password', { exact: true }).fill('onlylowercaseletters');
  await form.getByLabel('Confirm new password').fill('onlylowercaseletters');
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(form.getByRole('alert')).toHaveText('Use at least three of: lowercase letters, uppercase letters, numbers, and symbols.');
  await form.getByLabel('New password', { exact: true }).fill('FixtureNew123!');
  await form.getByLabel('Confirm new password').fill('FixtureNew123!');
  await page.route('**/api/internal/password', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      currentPassword: 'FixtureOld123!', newPassword: 'FixtureNew123!',
    });
    await route.fulfill({ json: { changed: true } });
  });
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toContainText('other sessions have been signed out');
  await expect(form.getByLabel('Current password')).toHaveValue('');
});

test('Account Settings panel can be disabled independently of Hubstaff', async ({ page }) => {
  await page.goto('/internal/settings?no_account_settings=true');
  await expect(page.getByRole('heading', { name: 'Hubstaff connection' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account security' })).toHaveCount(0);
});

test('Internal Settings resets another user password with manager reauthentication', async ({ page }) => {
  await page.goto('/role-settings');
  await page.getByRole('button', { name: /Taylor Team/ }).click();
  await page.getByRole('button', { name: 'Reset password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset password for Taylor Team' });
  await dialog.getByLabel('Your current password').fill('FixtureManager123!');
  await dialog.getByLabel('New password for this user').fill('onlylowercaseletters');
  await dialog.getByLabel('Confirm new password').fill('onlylowercaseletters');
  await dialog.getByRole('button', { name: 'Reset password' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Use at least three of: lowercase letters, uppercase letters, numbers, and symbols.');
  await dialog.getByLabel('New password for this user').fill('FixtureReset123!');
  await dialog.getByLabel('Confirm new password').fill('FixtureReset123!');
  await page.route('**/api/internal/password', async route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({ id: '2', currentPassword: 'FixtureManager123!',
      newPassword: 'FixtureReset123!' });
    await route.fulfill({ json: { reset: true } });
  });
  await dialog.getByRole('button', { name: 'Reset password' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Taylor Team\'s password was reset');
  await page.getByRole('button', { name: /Fixture Admin/ }).click();
  await expect(page.getByRole('button', { name: 'Reset password' })).toHaveCount(0);
});

test('assigned functional roles link directly from the desktop sidebar', async ({ page }) => {
  await page.goto('/role-panels');
  await expect(page).toHaveURL(/\/role-panels\/hr$/);
  const nav = page.getByRole('navigation', { name: 'Internal portal' });
  await expect(nav.getByText('My Workspace')).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(2);
  await expect(nav.getByRole('link', { name: 'HR' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Sales' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Billing' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Role Panels' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Sales' }).click();
  await expect(page).toHaveURL(/\/role-panels\/sales$/);
  await expect(page.getByRole('heading', { name: 'Sales', exact: true })).toBeVisible();
});

test('mobile hamburger opens the same role sidebar and closes after navigation', async ({ page }) => {
  const dashboardRequests = [];
  page.on('request', request => {
    if (request.url().includes('/api/internal/dashboard')) dashboardRequests.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/role-panels');
  await expect(page).toHaveURL(/\/role-panels\/hr$/);
  await expect(page.getByRole('heading', { name: 'HR', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Billing' })).toHaveCount(0);
  const menuButton = page.getByRole('button', { name: 'Open menu' });
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('navigation', { name: 'Internal portal' })).toBeHidden();
  await menuButton.click();
  const drawer = page.getByRole('dialog', { name: 'Internal portal navigation' });
  await expect(drawer).toBeVisible();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.getByRole('link', { name: 'HR' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Sales' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Billing' })).toHaveCount(0);
  await drawer.getByRole('link', { name: 'Sales' }).click();
  await expect(page).toHaveURL(/\/role-panels\/sales$/);
  await expect(drawer).toHaveCount(0);
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Planned areas' })).toBeVisible();
  await expect(page.getByText('No live business data or actions are available here yet.')).toBeVisible();
  await menuButton.click();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  expect(dashboardRequests).toEqual([]);
});

test('short sidebar keeps identity visible and scrolls only the navigation on desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 350 });
  await page.goto('/role-panels');
  let nav = page.getByRole('navigation', { name: 'Internal portal' });
  const desktop = await nav.evaluate(element => ({
    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(desktop.scrollHeight).toBeGreaterThan(desktop.clientHeight);
  expect(desktop.overflowY).toBe('auto');
  await nav.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('aside#internal-sidebar').getByText('Fixture Internal User')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 350 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Internal portal navigation' });
  nav = drawer.getByRole('navigation', { name: 'Internal portal' });
  const mobile = await nav.evaluate(element => ({
    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(mobile.scrollHeight).toBeGreaterThan(mobile.clientHeight);
  expect(mobile.overflowY).toBe('auto');
  await nav.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(drawer.getByText('Fixture Internal User')).toBeVisible();
});
