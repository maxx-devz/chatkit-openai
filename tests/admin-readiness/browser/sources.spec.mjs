import {test,expect} from '@playwright/test';
const saved={configured:true,connected:false,accessVerified:false,hasAuthorization:true,state:'drive_token_unreadable',
  allowedEmail:'admin@example.com',email:'admin@example.com',redirectUri:'http://127.0.0.1:3000/api/admin/source-connections/callback',
  connectedAt:'2026-11-16T05:07:36.548Z',connectionMessage:'The saved Drive authorization cannot be read with this server encryption configuration.'};
const prepared={ready:false,documents:[],folders:[],publications:[],clients:[],sync:{},sharedEnabled:true};
async function mockSources(page,readStatus){
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/admin/source-connections' && route.request().method()==='GET')return readStatus(route);
    if(url.pathname==='/api/admin/source-connections')return route.fulfill({json:{rootName:'Synthetic company knowledge',files:[],checkedAt:new Date().toISOString()}});
    if(url.pathname==='/api/admin/source-connections/prepared')return route.fulfill({json:prepared});
    return route.fulfill({status:503,json:{error:'Isolated fixture; no real integration request sent.'}});
  });
}
test('an old connected callback URL cannot claim unverified Drive access',async({page})=>{
  await mockSources(page,route=>route.fulfill({json:saved}));await page.goto('/admin/sources?connection=connected');
  await expect(page.getByText('Saved authorization - access not verified',{exact:true})).toBeVisible();
  await expect(page.getByText('Google sign-in returned, but Drive access is not verified.',{exact:false})).toBeVisible();
  await expect(page.getByText('Google Drive authorization and folder access verified.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Discover / refresh sources'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Synchronize now',exact:true})).toBeDisabled();
});
test('a rejected OAuth client gives setup guidance instead of a success notice',async({page})=>{
  await mockSources(page,route=>route.fulfill({json:saved}));await page.goto('/admin/sources?connection=client_rejected');
  await expect(page.getByRole('status').filter({hasText:"Google rejected this app's OAuth client credentials."})).toContainText('GOOGLE_DRIVE_CLIENT_SECRET');
  await expect(page.getByText('Google Drive authorization and folder access verified.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Discover / refresh sources'})).toBeDisabled();
});
test('checking access replaces stale connected status and a failed check never leaves it verified',async({page})=>{
  let checking=false,release;const held=new Promise(resolve=>{release=resolve;});
  await mockSources(page,async route=>{if(!checking)return route.fulfill({json:{...saved,connected:true,accessVerified:true,state:'ready',connectionMessage:'Drive access verified.'}});
    await held;return route.fulfill({status:503,json:{error:'Fixture: current access could not be checked.'}});});
  await page.goto('/admin/sources?connection=connected');await expect(page.getByText('Connected as admin@example.com',{exact:true})).toBeVisible();
  checking=true;
  await page.getByRole('button',{name:'Check connection',exact:true}).click();
  await expect(page.getByText('Checking Google Drive access...',{exact:true})).toBeVisible();
  await expect(page.getByText('Connected as admin@example.com',{exact:true})).toHaveCount(0);release();
  await expect(page.getByRole('alert').filter({hasText:'Fixture: current access could not be checked.'})).toBeVisible();
  await expect(page.getByText('Saved authorization - access not verified',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Discover / refresh sources'})).toBeDisabled();
  await expect(page.getByText('Google Drive authorization and folder access verified.',{exact:true})).toHaveCount(0);
});
