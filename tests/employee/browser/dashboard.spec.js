import { test, expect } from '@playwright/test';

function fixture() {
  const due = new Date(Date.now() + 86400000).toISOString();
  const old = new Date(Date.now() - 86400000).toISOString();
  return { connection: { connected: true, name: 'Fixture Employee' }, syncedAt: new Date().toISOString(),
    projects: [{ id: '77', name: 'Shop Alpha' }, { id: '88', name: 'Shop Beta' }], tasks: [
      { id: '1', title: 'Fix PDP layout', projectId: '77', projectName: 'Shop Alpha', status: 'In Progress', stage: 'in_progress', done: false, dueAt: due, updatedAt: old },
      { id: '2', title: 'Update product import', projectId: '88', projectName: 'Shop Beta', status: 'Assigned', stage: 'other', done: false, dueAt: old, updatedAt: old },
      { id: '3', title: 'Accessibility QA', projectId: '77', projectName: 'Shop Alpha', status: 'Done', stage: 'done', done: true, completedAt: old, updatedAt: old },
    ] };
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`assigned tasks, filtering and responsive layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/employee/dashboard', route => route.fulfill({ json: fixture() }));
    await page.goto('/');
    const assigned = page.getByRole('region', { name: 'My Assigned Tasks' });
    await expect(assigned.getByRole('heading', { name: 'Fix PDP layout' })).toBeVisible();
    await expect(assigned.getByRole('heading', { name: 'Accessibility QA' })).toHaveCount(0);
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    await expect(assigned.getByText(/Overdue ·/)).toBeVisible();
    await page.screenshot({ path: `test-results/employee-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel('Search tasks', { exact: true }).fill('product');
    await expect(assigned.getByRole('heading', { name: 'Fix PDP layout' })).toHaveCount(0);
    await expect(assigned.getByRole('heading', { name: 'Update product import' })).toBeVisible();
    await page.getByLabel('Search tasks', { exact: true }).fill('');
    await page.getByLabel('Project', { exact: true }).selectOption('77');
    await expect(assigned.getByRole('heading', { name: 'Update product import' })).toHaveCount(0);
    await page.getByLabel('Status', { exact: true }).selectOption('done');
    await expect(assigned.getByRole('heading', { name: 'Accessibility QA' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Refresh Hubstaff data/ })).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });
}

test('loading, empty and safe error states work without showing stale task data', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/employee/dashboard', async route => { await gate; await route.fulfill({ json: fixture() }); });
  await page.goto('/');
  await expect(page.getByText('Loading your assigned tasks')).toBeAttached();
  release();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.unroute('**/api/employee/dashboard');
  await page.route('**/api/employee/dashboard', route => route.fulfill({ status: 400, json: { error: 'Your Hubstaff access token is invalid or expired. Please reconnect.' } }));
  await page.getByRole('button', { name: 'Refresh Hubstaff data' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or expired');
  await expect(page.getByRole('heading', { name: 'Fix PDP layout' })).toHaveCount(0);
  await page.unroute('**/api/employee/dashboard');
  await page.route('**/api/employee/dashboard', route => route.fulfill({ json: { ...fixture(), tasks: [] } }));
  await page.getByRole('button', { name: 'Refresh Hubstaff data' }).click();
  await expect(page.getByRole('heading', { name: 'No assigned tasks yet' })).toBeVisible();
});

test('token entry is a native password POST with no browser storage or URL token', async ({ page }) => {
  await page.goto('/?connected=false');
  const input = page.getByLabel('Personal access token', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  const synthetic = 'browser-fixture-token-not-a-real-credential';
  await input.fill(synthetic);
  await page.route('**/api/employee/connection', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().url()).not.toContain(synthetic);
    expect(new URLSearchParams(route.request().postData()).get('token')).toBe(synthetic);
    await route.fulfill({ status: 303, headers: { location: '/?connected=false' } });
  });
  await page.getByRole('button', { name: 'Validate and connect' }).click();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(synthetic);
  expect(await page.content()).not.toContain(synthetic);
});
