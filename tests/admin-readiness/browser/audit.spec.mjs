import {test,expect} from '@playwright/test';
const reference='6ad831e4-b30b-4d86-a96d-97b5246ce98a';
async function fixture(page,{offline=false,delayFirst=false}={}){
 const events=[],reads=[];let submissions=0;
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/admin/audit-events'){
   if(request.method()==='POST'){events.push(...request.postDataJSON().events);submissions++;if(delayFirst&&submissions===1)await new Promise(resolve=>setTimeout(resolve,900));return route.fulfill({status:offline?503:200,json:offline?{error:'Unavailable'}:{accepted:1}});}
   reads.push(Object.fromEntries(url.searchParams));return route.fulfill({json:{ready:true,page:1,asOf:new Date().toISOString(),hasMore:false,totals:{all:3,succeeded:1,attention:1},clients:[{id:'1',name:'Alpha'}],actors:[{id:'1',name:'Synthetic Administrator'}],rows:[
    {request_id:reference,operation:'admin.clients.update',outcome:'failed',summary:'A value or operation already exists. Review the current record before retrying.',actor_name:'Synthetic Administrator',client_name:'Alpha',occurred_at:new Date().toISOString(),origin:'server',method:'PATCH',route:'/api/admin/clients',http_status:409,duration_ms:140,error_code:'23505',source_location:'/lib/clients.js:45:2',details:{fields:['name','portalEnabled'],values:{portalEnabled:true}}},
    {request_id:'7ad831e4-b30b-4d86-a96d-97b5246ce98a',operation:'admin.client_plan.save',outcome:'started',summary:'Started',actor_name:'Synthetic Administrator',client_name:'Alpha',occurred_at:new Date().toISOString(),origin:'server',method:'POST',route:'/api/admin/client-plan',details:{}},
    {request_id:'8ad831e4-b30b-4d86-a96d-97b5246ce98a',operation:'admin.client_plan.save',outcome:'succeeded',summary:'Monthly client plan saved.',actor_name:'Synthetic Administrator',client_name:'Alpha',occurred_at:new Date().toISOString(),origin:'server',method:'POST',route:'/api/admin/client-plan',http_status:200,details:{values:{price:'200',credits:'5000',status:'active'},saved_values:{price:'200.00',credits:'5000',status:'active'},omitted_fields:['password','apiKey']}},
   ]}});
  }
  if(url.pathname==='/api/admin/presence')return route.fulfill({json:{clients:[]}});
  return route.fulfill({json:{ok:true}});
 });return {events,reads};
}
test('Overview has six usable icon cards and stays within the viewport',async({page},info)=>{
 await fixture(page);await page.goto('/admin');const cards=page.getByRole('region',{name:'Admin workspaces'}).getByRole('link');await expect(cards).toHaveCount(6);await expect(page.getByRole('heading',{name:'Manage your portal'})).toBeVisible();
 for(const card of await cards.all()){await expect(card.locator('svg').first()).toBeVisible();await expect(card).toHaveAttribute('href',/^\/admin/);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('overview.png'),fullPage:true});
});
test('Audit timeline explains failures and interruptions, supports filters and shows safe code details',async({page},info)=>{
 const f=await fixture(page);await page.goto('/admin/audit');await expect(page.getByRole('heading',{name:'Admin activity timeline'})).toBeVisible();await expect(page.getByText('Outcome not recorded',{exact:true}).last()).toBeVisible();const activity=page.getByRole('table',{name:'Admin activity',exact:true});await activity.getByRole('button',{name:/Expand details: client plan save/i}).first().click();await expect(activity.getByText('It may still be running or was interrupted',{exact:false})).toBeVisible();
 await activity.getByRole('button',{name:/Expand details: clients update/i}).click();await expect(page.getByText('/lib/clients.js:45:2')).toBeVisible();await expect(page.getByText('23505',{exact:true})).toBeVisible();await expect(activity.getByText('POST · Submitted action',{exact:true}).first()).toBeVisible();
 await page.getByLabel('Outcome',{exact:true}).selectOption('failed');await page.getByLabel('Request reference').fill(reference);await page.getByRole('button',{name:'Apply filters'}).click();await expect.poll(()=>f.reads.at(-1)?.outcome).toBe('failed');expect(f.reads.at(-1).reference).toBe(reference);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('audit.png'),fullPage:true});
});
test('Opening the audit page, editing filters and expanding rows sends no browser audit submissions',async({page})=>{
 const f=await fixture(page);await page.goto('/admin/audit');await page.getByLabel('Request reference').fill('UNSAVED-FILTER-INPUT');await page.getByLabel('Outcome',{exact:true}).focus();
 const table=page.getByRole('table',{name:'Admin activity',exact:true});await table.getByRole('button',{name:/Expand details: clients update/i}).click();await page.waitForTimeout(2300);expect(f.events).toHaveLength(0);
 await expect(page.getByText('Activity recording needs attention.',{exact:false})).toHaveCount(0);await expect(table.getByText('Browser reported',{exact:false})).toHaveCount(0);await expect(page.getByLabel('Activity type').locator('option')).toHaveCount(3);
});
test('Expanded saved action shows submitted and committed safe values with sensitive fields excluded',async({page})=>{
 await fixture(page);await page.goto('/admin/audit');const table=page.getByRole('table',{name:'Admin activity',exact:true});const saved=table.locator('tr[data-activity-row]').filter({hasText:'Monthly client plan saved.'});await saved.getByRole('button').click();
 const detail=table.getByRole('region',{name:/Details: client plan save/i}).last();await expect(detail).toBeVisible();await expect(detail).toContainText('Submitted values');await expect(detail).toContainText('Confirmed saved');await expect(detail).toContainText('200.00');await expect(detail).toContainText('Excluded fields');await expect(detail).toContainText('password');await expect(detail).toContainText('values not recorded');
});

test('Historical rows explain actions, targets, HTTP results and messages without guessing older codes',async({page},info)=>{
 await fixture(page);await page.goto('/admin/audit');const table=page.getByRole('region',{name:'Historical admin records table',exact:true});await expect(table.getByRole('columnheader',{name:'HTTP status'})).toBeVisible();await expect(table.getByRole('columnheader',{name:'Log details · What happened'})).toBeVisible();
 const old=table.getByRole('row').filter({hasText:'Updated client settings'});await expect(old).toContainText('Client #2');await expect(old).toContainText('Not recorded');await expect(old).toContainText('did not store an HTTP response code');await expect(old).not.toContainText('200');
 const created=table.getByRole('row').filter({hasText:'Created client account'});await expect(created).toContainText('201 Created');await expect(created).toContainText('The server completed this request successfully.');await created.getByText('View request log').click();await expect(created).toContainText('POST /api/admin/clients');
 const denied=table.getByRole('row').filter({hasText:'Granted client administrator access'});await expect(denied).toContainText('Account #62');await expect(denied).toContainText('404 Not found');await expect(denied).toContainText('The requested record or resource was not available.');await denied.getByText('View request log').click();await expect(denied).toContainText('client_not_found');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await table.screenshot({path:info.outputPath('historical-records.png')});
});

test('Activity table rows expand and collapse from the message cell, button, keyboard and touch',async({page},info)=>{
 const f=await fixture(page);await page.goto('/admin/audit');const table=page.getByRole('table',{name:'Admin activity',exact:true});await expect(table).toBeVisible();
 const row=table.locator('tr[data-activity-row]').first(),toggle=row.getByRole('button'),region=table.getByRole('region',{name:/Details: clients update/i});
 await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(region).toBeHidden();const reads=f.reads.length;
 const cell=row.getByRole('cell').last();if(info.project.name==='touch')await cell.tap();else await cell.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(region).toBeVisible();await expect(region).toContainText('23505');
 if(info.project.name==='touch')await cell.tap();else await cell.click();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(region).toBeHidden();
 await toggle.focus();await toggle.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','true');await toggle.press('Space');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();await expect(region).toBeVisible();await toggle.click();await expect(region).toBeHidden();expect(f.reads.length).toBe(reads);
 await expect(table.locator('article')).toHaveCount(0);await expect(table.getByRole('columnheader',{name:'Message',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
