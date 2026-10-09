import { test, expect } from '@playwright/test';

function fixture() {
  const due = new Date(Date.now() + 86400000).toISOString();
  const old = new Date(Date.now() - 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const weekStartDate = new Date(`${today}T12:00:00Z`);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - ((weekStartDate.getUTCDay() + 6) % 7));
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  return { connection: { connected: true, name: 'Fixture Employee' }, syncedAt: new Date().toISOString(),
    projects: [{ id: '77', name: 'Shop Alpha' }, { id: '88', name: 'Shop Beta' }], tasks: [
      { id: '1', title: 'Fix PDP layout', description: 'Correct the mobile product layout and verify its responsive states.', href: 'https://tasks.hubstaff.com/app/organizations/9/projects/77/tasks/1', projectId: '77', projectName: 'Shop Alpha', status: 'In Progress', stage: 'in_progress', done: false, dueAt: due, createdAt: new Date().toISOString(), updatedAt: old, priority: { name: 'High Priority', level: 'high' } },
      { id: '2', title: 'Update product import', description: 'Review the latest catalog import and resolve rejected product rows.', href: 'https://tasks.hubstaff.com/app/organizations/9/projects/88/tasks/2', projectId: '88', projectName: 'Shop Beta', status: 'Assigned', stage: 'other', done: false, dueAt: old, createdAt: old, updatedAt: old },
      { id: '3', title: 'Accessibility QA', projectId: '77', projectName: 'Shop Alpha', status: 'Done', stage: 'done', done: true, createdAt: old, completedAt: old, updatedAt: old },
    ], workSummary: { timeAvailable: true, timePartial: false, timeZone: 'UTC',
      today: { date: today, trackedHours: 2.5, activityRate: 64 },
      week: { start: weekStart, stop: today, trackedHours: 17.75, activityRate: 67 } } };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/employee/task-guidance', async route => {
    const { taskIds } = route.request().postDataJSON();
    await route.fulfill({ json: { guidance: taskIds.map(taskId => ({
      taskId, label: 'continue_work', badgeText: 'AOC should finish the assigned work',
      reason: 'Continue the assigned work and review the discussion.',
    })) } });
  });
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 800, height: 900 }, { width: 390, height: 844 }]) {
  test(`assigned tasks, filtering and responsive layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: fixture() }));
    await page.goto('/');
    const employeeNav = page.locator('nav[aria-label="Employee portal"]');
    if (viewport.width > 720) {
      await expect(employeeNav).toBeVisible();
      await expect(employeeNav.getByRole('link')).toHaveText(['My Work', 'Settings']);
      if (viewport.width <= 900) await expect(employeeNav.getByText('My Work')).toBeHidden();
    } else {
      await expect(employeeNav).toBeHidden();
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
    await page.screenshot({ path: `test-results/employee-${viewport.width}.png`, fullPage: true });
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

test('project manager policy adds team panels and a server-fed employee directory', async ({ page }) => {
  const data = { ...fixture(), teamMembers: [
    { id: '1', name: 'Fixture Employee', position: 'Project Manager', connected: true },
    { id: '2', name: 'Taylor Team', position: 'Team Member', connected: false },
  ] };
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: data }));
  await page.goto('/employee?manager=true');
  const employeeNav = page.locator('nav[aria-label="Employee portal"]');
  await expect(employeeNav.getByRole('link')).toHaveText(['My Work', 'Team Workspace', 'Settings']);
  await expect(page.getByRole('heading', { name: 'My Assigned Tasks' })).toBeVisible();
  await employeeNav.getByRole('link', { name: 'Team Workspace' }).click();
  await expect(page).toHaveURL(/\/employee\/team$/);
  await expect(page.getByRole('heading', { name: 'My Assigned Tasks' })).toHaveCount(0);
  const directory = page.locator('#team-directory');
  await expect(directory.getByRole('heading', { name: 'Team directory' })).toBeVisible();
  await expect(directory.getByText('Taylor Team')).toBeVisible();
  await expect(directory.getByText('Setup needed')).toBeVisible();
  const teamTasks = page.locator('#team-tasks');
  await expect(teamTasks.getByRole('heading', { name: 'Team tasks' })).toBeVisible();
  await expect(teamTasks.getByText('Planned', { exact: true })).toBeVisible();
});

test('workspace navigation reuses loaded data and keeps Hubstaff refresh in the shared header', async ({ page }) => {
  const requests = { personal: 0, team: 0, settings: 0 };
  await page.route('**/api/employee/dashboard**', route => {
    const workspace = new URL(route.request().url()).searchParams.get('workspace') || 'personal';
    requests[workspace] += 1;
    return route.fulfill({ json: { ...fixture(), teamMembers: [
      { id: '1', name: 'Fixture Employee', position: 'Project Manager', connected: true },
    ] } });
  });

  await page.goto('/employee');
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
  expect(requests.personal).toBe(1);

  const employeeNav = page.locator('nav[aria-label="Employee portal"]');
  await employeeNav.getByRole('link', { name: 'Team Workspace' }).click();
  const directory = page.locator('#team-directory');
  await expect(directory.getByText('Fixture Employee')).toBeVisible();
  await expect.poll(() => requests.team).toBe(1);
  const refresh = page.getByRole('banner').getByRole('button', { name: 'Refresh Hubstaff data' });
  await expect(refresh).toBeVisible();
  await refresh.click();
  await expect(page.getByRole('banner').getByText('Hubstaff data updated.')).toBeVisible();
  expect(requests.personal).toBe(2);

  await employeeNav.getByRole('link', { name: 'My Work' }).click();
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
  expect(requests.personal).toBe(2);

  await employeeNav.getByRole('link', { name: 'Team Workspace' }).click();
  await expect(directory.getByText('Fixture Employee')).toBeVisible();
  await page.waitForTimeout(100);
  expect(requests.team).toBe(1);

  await employeeNav.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Hubstaff connection' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Refresh Hubstaff data' })).toBeVisible();
  await expect.poll(() => requests.settings).toBe(1);
});

test('AI recommendations replace workflow-stage badges on active task cards', async ({ page }) => {
  const data = fixture();
  const base = data.tasks[0];
  data.tasks = [
    { ...base, id: 'todo', title: 'Todo task', status: 'To Do', stage: 'todo', done: false },
    { ...base, id: 'progress', title: 'Progress task', status: 'In Progress', stage: 'in_progress', done: false },
    { ...base, id: 'done', title: 'Done task', status: 'Complete', stage: 'done', done: true },
    { ...base, id: 'review', title: 'Review task', status: 'Client Review', stage: 'review', done: false },
  ];
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: data }));
  await page.route('**/api/employee/task-guidance', async route => {
    const labels = { todo: 'needs_reply', progress: 'continue_work', review: 'review_for_close' };
    const badgeTexts = { todo: 'AOC should answer the latest question',
      progress: 'AOC should finish the requested update',
      review: 'AOC should verify approval before closing' };
    const { taskIds } = route.request().postDataJSON();
    await route.fulfill({ json: { guidance: taskIds.map(taskId => ({
      taskId, label: labels[taskId], badgeText: badgeTexts[taskId],
      reason: 'Based on the latest task discussion.',
    })) } });
  });
  await page.goto('/');
  await page.getByLabel('Status', { exact: true }).selectOption('all');
  const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
  for (const [title, action] of [
    ['Todo task', 'AOC should answer the latest question'],
    ['Progress task', 'AOC should finish the requested update'],
    ['Done task', 'Completed'], ['Review task', 'AOC should verify approval before closing'],
  ]) {
    await expect(assigned.getByRole('listitem').filter({ hasText: title }).getByText(action, { exact: true })).toBeVisible();
  }
  await expect(assigned.getByText(/Stage:/)).toHaveCount(0);
});

test('AI-written badge wording fits a narrow task card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: fixture() }));
  await page.route('**/api/employee/task-guidance', async route => {
    const { taskIds } = route.request().postDataJSON();
    await route.fulfill({ json: { guidance: taskIds.map(taskId => ({ taskId,
      label: 'needs_reply', badgeText: 'AOC should follow up with the external reviewer today',
      reason: 'The requested confirmation has not arrived.' })) } });
  });
  await page.goto('/');
  const card = page.getByRole('region', { name: 'My Assigned Tasks' })
    .getByRole('listitem').filter({ hasText: 'Fix PDP layout' });
  const badge = card.getByLabel('AI next action: AOC should follow up with the external reviewer today');
  await expect(badge).toBeVisible();
  const bounds = await card.evaluate(element => {
    const cardBounds = element.getBoundingClientRect();
    const badgeBounds = element.querySelector('[aria-label^="AI next action:"]').getBoundingClientRect();
    return { cardLeft: cardBounds.left, cardRight: cardBounds.right,
      badgeLeft: badgeBounds.left, badgeRight: badgeBounds.right };
  });
  expect(bounds.badgeLeft).toBeGreaterThanOrEqual(bounds.cardLeft);
  expect(bounds.badgeRight).toBeLessThanOrEqual(bounds.cardRight);
});

test('task cards wait for AI analysis and then show its recommendation', async ({ page }) => {
  const data = fixture();
  let releaseGuidance;
  const guidanceGate = new Promise(resolve => { releaseGuidance = resolve; });
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: data }));
  await page.route('**/api/employee/task-guidance', async route => {
    await guidanceGate;
    await route.fulfill({ json: { guidance: [
      { taskId: '1', label: 'review_for_close', badgeText: 'AOC should verify approval before closing',
        reason: 'The latest participant acknowledged the delivery.' },
      { taskId: '2', label: 'needs_attention', badgeText: 'AOC should clarify the next change',
        reason: 'Check the discussion before proceeding.' },
    ] } });
  });
  await page.goto('/');
  const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
  const card = assigned.getByRole('listitem')
    .filter({ hasText: 'Fix PDP layout' });
  await expect(assigned.getByText('Analyzing task conversations before showing recommendations…')).toBeVisible();
  await expect(card).toHaveCount(0);
  releaseGuidance();
  await expect(card.getByLabel('AI next action: AOC should verify approval before closing')).toBeVisible();
  await expect(card.getByText(/Stage:/)).toHaveCount(0);
  await card.getByRole('button', { name: 'View details for Fix PDP layout' }).click();
  await expect(card.getByText('In Progress', { exact: true })).toBeVisible();
  await expect(card.getByText(/The latest participant acknowledged the delivery/)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Hide details for Fix PDP layout' })).toBeVisible();
});

test('failed AI analysis never substitutes the Hubstaff stage for a recommendation', async ({ page }) => {
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: fixture() }));
  await page.route('**/api/employee/task-guidance', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/');
  const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
  const card = assigned.getByRole('listitem').filter({ hasText: 'Fix PDP layout' });
  await expect(card.getByLabel('AI analysis unavailable')).toBeVisible();
  await expect(card.getByText(/Stage:/)).toHaveCount(0);
  await expect(assigned.getByRole('button', { name: 'Retry analysis' })).toBeVisible();
  await card.getByRole('button', { name: 'View details for Fix PDP layout' }).click();
  await expect(card.getByText('In Progress', { exact: true })).toBeVisible();
});

test('a rejected provider model shows an actionable reason on the task card', async ({ page }) => {
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: fixture() }));
  await page.route('**/api/employee/task-guidance', async route => {
    const { taskIds } = route.request().postDataJSON();
    await route.fulfill({ json: { guidance: taskIds.map(taskId => ({ taskId, label: null,
      reason: 'The selected AI model is unavailable. Ask an AOC administrator to choose an available model.' })) } });
  });
  await page.goto('/');
  const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
  const card = assigned.getByRole('listitem').filter({ hasText: 'Fix PDP layout' });
  await expect(card.getByLabel('AI analysis unavailable')).toBeVisible();
  await expect(card.getByText(/selected AI model is unavailable/)).toBeVisible();
});

test('AI requests include only active tasks on the current page', async ({ page }) => {
  const data = fixture();
  data.tasks = Array.from({ length: 12 }, (_, index) => ({ ...data.tasks[0],
    id: String(index + 1), title: `Paged task ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
  }));
  const requested = [];
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: data }));
  await page.route('**/api/employee/task-guidance', async route => {
    const { taskIds } = route.request().postDataJSON();
    requested.push(taskIds);
    await route.fulfill({ json: { guidance: taskIds.map(taskId => ({ taskId,
      label: 'continue_work', badgeText: 'AOC should finish the assigned work',
      reason: 'Continue the assigned work.' })) } });
  });
  await page.goto('/');
  await expect.poll(() => requested.length).toBe(2);
  assertPageRequests(requested, 10);
  await page.getByRole('navigation', { name: 'Assigned task pages' }).getByRole('button', { name: 'Next' }).click();
  await expect.poll(() => requested.length).toBe(3);
  expect(requested[2]).toHaveLength(2);
  expect(new Set(requested.flat()).size).toBe(12);
});

function assertPageRequests(requested, expectedCount) {
  expect(requested.flat()).toHaveLength(expectedCount);
  expect(new Set(requested.flat()).size).toBe(expectedCount);
}

test('urgent active tasks appear in Needs attention without requiring a due date', async ({ page }) => {
  const data = fixture();
  const base = data.tasks[0];
  data.tasks = [
    { ...base, id: 'urgent', title: 'Urgent undated task', dueAt: '', priority: { name: 'Urgent', level: 'urgent' } },
    { ...base, id: 'regular', title: 'Regular undated task', dueAt: '', priority: { name: 'High Priority', level: 'high' } },
    { ...base, id: 'completed-urgent', title: 'Completed urgent task', dueAt: '', done: true, stage: 'done', priority: { name: 'Urgent', level: 'urgent' } },
  ];
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: data }));
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
  await page.route('**/api/employee/dashboard**', async route => { await gate; await route.fulfill({ json: fixture() }); });
  await page.goto('/');
  await expect(page.getByText('Loading your assigned tasks')).toBeAttached();
  release();
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
  await page.unroute('**/api/employee/dashboard**');
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ status: 400, json: { error: 'Your Hubstaff access token is invalid or expired. Please reconnect.' } }));
  await page.getByRole('button', { name: 'Refresh Hubstaff data' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or expired');
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toHaveCount(0);
  await page.unroute('**/api/employee/dashboard**');
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: { ...fixture(), tasks: [] } }));
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
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: { ...fixture(), tasks } }));
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
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: fixture() }));
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
    localStorage.setItem(`aoc-employee-today-plan:${encodeURIComponent('Fixture Employee')}:${dateKey}`, JSON.stringify({
      taskIds: ['1', '2'], workingTaskId: '1', completedTaskIds: [], carryOverHandled: false,
    }));
  });
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: fixture() }));
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
  await page.route('**/api/employee/dashboard**', route => route.fulfill({ json: {
    connection: { connected: false }, tasks: [], projects: [], teamMembers: [], syncedAt: null,
  } }));
  await page.goto('/employee/settings?connected=false');
  await expect(page.getByRole('heading', { name: 'My Assigned Tasks' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Hubstaff connection' })).toBeVisible();
  const input = page.getByLabel('Personal access token', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  const synthetic = 'browser-fixture-token-not-a-real-credential';
  await input.fill(synthetic);
  await page.route('**/api/employee/connection', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().url()).not.toContain(synthetic);
    expect(new URLSearchParams(route.request().postData()).get('token')).toBe(synthetic);
    await route.fulfill({ status: 303, headers: { location: '/employee/settings?connected=false' } });
  });
  await page.getByRole('button', { name: 'Validate and connect' }).click();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(synthetic);
  expect(await page.content()).not.toContain(synthetic);
});
