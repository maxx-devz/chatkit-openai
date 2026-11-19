import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const f = JSON.parse(readFileSync(process.env.PLATFORM_CONSOLE_FIXTURE, 'utf8')), { accounts } = f;
let db;
test.beforeAll(async () => {
  const url = new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL); expect(url.hostname).toBe('127.0.0.1'); expect(url.pathname).toBe(f.database);
  db = new pg.Client({ connectionString: url.href }); await db.connect();
  expect((await db.query('SELECT current_database() name')).rows[0].name).toBe(url.pathname.slice(1));
});
test.afterAll(async () => { await db?.end(); });
test.beforeEach(async ({ context }) => {
  await db.query('DELETE FROM "rateLimit"');
  await context.route('**/*', route => new URL(route.request().url()).origin === f.origin ? route.continue() : route.abort('blockedbyclient'));
});
async function login(page, key) {
  await page.goto('/login'); await page.getByRole('textbox', { name: 'Username', exact: true }).fill(accounts[key].username);
  await page.getByLabel('Password', { exact: true }).fill(accounts[key].password);
  await page.getByRole('button', { name: /sign in to portal/i }).click(); await page.waitForURL(url => url.pathname === '/');
}
test('platform owner can review/search/create an agency without private content access', async ({ page, context }) => {
  await login(page, 'owner'); await page.goto('/platform'); await expect(page.getByRole('heading', { name: 'Agency workspaces', exact: true })).toBeVisible();
  await expect(page.getByText(/External agency access remains gated/)).toBeVisible();
  const directory = page.getByRole('table').first();
  await expect(directory.getByText('Synthetic Redwood', { exact: true })).toBeVisible();
  await page.getByLabel('Agency name', { exact: true }).fill('Synthetic Browser Meadow');
  await page.getByLabel('Agency slug', { exact: true }).fill('s12-browser-meadow');
  await page.getByLabel('Owner account identifier', { exact: true }).fill(accounts.agencyOwner.external);
  await page.getByLabel('Creation reason', { exact: true }).fill('Synthetic local browser review');
  await page.getByRole('button', { name: 'Create agency', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Agency created/ })).toBeVisible();
  await page.getByLabel('Search agencies', { exact: true }).fill('browser meadow');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(directory.getByText('Synthetic Browser Meadow', { exact: true })).toBeVisible();
  await expect(directory.getByText('Synthetic Redwood', { exact: true })).toHaveCount(0);
  expect(await page.textContent('body')).not.toMatch(/S11_CANARY|PRIVATE_ADMIN|AGENCY_A_ONLY/);
  expect((await context.request.get('/api/admin/clients')).status()).toBe(403);
  expect((await context.request.get('/agency')).status()).toBe(404);
});
test('operator sees metadata and has no creation/lifecycle controls or direct write permission', async ({ page, context }) => {
  await login(page, 'operator'); await page.goto('/platform');
  await expect(page.getByRole('heading', { name: 'Agency directory', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create an agency', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Suspend / })).toHaveCount(0);
  const response = await context.request.post('/api/platform/agencies', { data: { action: 'suspend', agencyId: f.agency.id, operation: crypto.randomUUID(), version: '2', confirmation: f.agency.slug, reason: 'forged operator' } }); expect(response.status()).toBe(403);
});
test('agency staff, client administrator and legacy AOC Admin are denied platform UI and APIs', async ({ page, context }) => {
  for (const key of ['foreignStaff', 'clientApprover', 'agencyApprover', 'agencyOwner']) {
    await context.clearCookies(); await login(page, key); await page.goto('/platform');
    await expect(page.getByRole('heading', { name: 'Platform staff access required', exact: true })).toBeVisible();
    const response = await context.request.get('/api/platform/agencies?role=owner'); expect(response.status()).toBe(403); expect(await response.text()).not.toMatch(/Redwood|Orchid|CANARY/);
    expect((await context.request.post('/api/platform/agencies', { data: { action: 'create', role: 'owner' } })).status()).toBe(403);
  }
});
test('suspension needs reason and typed confirmation, is audited, and supports reactivation', async ({ page }) => {
  await login(page, 'owner'); await page.goto('/platform');
  await page.getByRole('button', { name: 'Suspend Synthetic Browser Meadow', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Billing is unchanged');
  await dialog.getByLabel('Reason', { exact: true }).fill('Synthetic browser suspension');
  await dialog.getByLabel('Type s12-browser-meadow to confirm', { exact: true }).fill('s12-browser-meadow');
  await dialog.getByRole('button', { name: 'Suspend agency', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reactivate Synthetic Browser Meadow', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate Synthetic Browser Meadow', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reason', { exact: true }).fill('Synthetic browser reactivation');
  await page.getByRole('dialog').getByLabel('Type s12-browser-meadow to confirm', { exact: true }).fill('s12-browser-meadow');
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivate agency', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Suspend Synthetic Browser Meadow', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic browser suspension', { exact: true })).toBeVisible();
});
test('already-open console loses access after owner revocation; denied writes have no effect', async ({ page, context }) => {
  await login(page, 'owner'); await page.goto('/platform');
  await expect(page.getByRole('heading', { name: 'Agency directory', exact: true })).toBeVisible();
  try {
    await db.query('UPDATE agency_platform.platform_memberships SET is_active=false WHERE user_id=$1', [accounts.owner.id]);
    expect((await context.request.post('/api/platform/agencies', { data: { action: 'create', role: 'owner' } })).status()).toBe(403);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Platform staff access required', exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic Redwood', { exact: true })).toHaveCount(0);
  } finally { await db.query('UPDATE agency_platform.platform_memberships SET is_active=true WHERE user_id=$1', [accounts.owner.id]); }
});
test('AOC-scoped delivery stays usable in a mixed estate without granting platform access', async ({ page, context }) => {
  await login(page, 'agencyApprover'); await page.goto('/admin/aoc');
  await expect(page.getByRole('heading', { name: 'AOC client delivery', exact: true })).toBeVisible();
  await expect(page.getByText('Stage11 Orchid', { exact: true })).toBeVisible();
  await expect(page.getByText('Stage11 Pine', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save Stage11 Orchid access', exact: true }).click();
  expect((await context.request.get('/api/platform/agencies')).status()).toBe(403);
  const foreign = await context.request.patch('/api/admin/aoc-clients', { data: { clientId: '1101', portalEnabled: false, aiEnabled: false } }); expect(foreign.status()).toBe(403);
  expect((await db.query('SELECT portal_enabled FROM portal_clients WHERE id=1101')).rows[0].portal_enabled).toBe(true);
});
test('support UI records two distinct consents and allows status only', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext({ baseURL: f.origin }), browser.newContext({ baseURL: f.origin }), browser.newContext({ baseURL: f.origin })]);
  const [owner, agency, client] = await Promise.all(contexts.map(c => c.newPage()));
  try {
    for (const context of contexts) await context.route('**/*', route => new URL(route.request().url()).origin === f.origin ? route.continue() : route.abort('blockedbyclient'));
    await login(owner, 'owner'); await owner.goto('/platform');
    console.log('Support browser: requester signed in');
    await owner.bringToFront();
    await owner.getByRole('combobox', { name: 'Support client', exact: true }).selectOption('501', { timeout: 10000 });
    console.log('Support browser: client selected');
    await owner.getByLabel('Support reason', { exact: true }).fill('Synthetic browser support'); await owner.getByLabel('Support ticket', { exact: true }).fill('BROWSER-12');
    await owner.getByRole('button', { name: 'Request status access', exact: true }).click(); await expect(owner.getByText(/BROWSER-12 · Synthetic browser support/)).toBeVisible();
    console.log('Support browser: request recorded');
    await login(agency, 'agencyApprover'); await agency.goto('/support/requests');
    const agencyRequest = agency.getByRole('article').filter({ hasText: 'BROWSER-12' });
    agency.once('dialog', d => d.accept()); await agencyRequest.getByRole('button', { name: 'Approve as agency administrator', exact: true }).click();
    await expect(agencyRequest).toContainText('Agency consent: recorded');
    console.log('Support browser: agency consent recorded');
    await login(client, 'clientApprover'); await client.goto('/support/requests');
    const clientRequest = client.getByRole('article').filter({ hasText: 'BROWSER-12' });
    client.once('dialog', d => d.accept()); await clientRequest.getByRole('button', { name: 'Approve as client administrator', exact: true }).click();
    await expect(clientRequest).toContainText('approved');
    console.log('Support browser: client consent recorded');
    await owner.getByRole('button', { name: 'Refresh support requests', exact: true }).click();
    await owner.getByRole('article').filter({ hasText: 'BROWSER-12' }).getByRole('button', { name: 'Check approved portal status', exact: true }).click();
    await expect(owner.getByRole('status').filter({ hasText: /Approved status: portal enabled/ })).toBeVisible();
    expect(await owner.textContent('body')).not.toMatch(/S11_CANARY|PRIVATE_ADMIN|AGENCY_A_ONLY/);
  } catch (error) { console.log('Support browser failure:', error.message); throw error; }
  finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
