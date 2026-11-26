import {test,expect} from '@playwright/test';
const period=new Date().toISOString().slice(0,7),runId='093c6cc0-90b6-4739-8670-37069cfb7d21';
async function fixture(page,{running=false,recoverable=false,failOnce=false,providerIssue=false}={}) {
 const data={ready:true,mode:'subscription',configured:true,clientId:'1',period,plan:{monthly_price:'200.00',monthly_credits:'1000',status:'active',version:'1'},month:{monthly_price:'200.00',included_credits:'1000',extra_credits:'150',used_credits:'0.485675'},availableCredits:'1149.514325',allocatedCredits:'1150',creditsUsed:'0.485675',canGenerate:recoverable,code:recoverable?'available':'plan_pending',usageState:running?'running':'review',message:running?'An AI reply is in progress. Credits will update when it finishes.':recoverable?'AI credits are available.':'AI is temporarily unavailable. Please contact your administrator. Your available portal credits are unchanged.',requests:[],runs:[{id:runId,status:running?'running':'review',resolvable:!running,recoverable,started_at:new Date().toISOString(),period}],audit:[],fetchedAt:'fixture-1',providerIssues:providerIssue?[{request_id:runId,error_code:'insufficient_quota',http_status:'429',provider:'openai',provider_request_id:'req_fixture',client_billing:'not_billed',created_at:new Date().toISOString()}]:[]};
 const writes=[];let failed=false;
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());if(url.pathname!=='/api/admin/client-plan')return route.fulfill({json:{ok:true}});
  if(route.request().method()==='GET')return route.fulfill({json:url.searchParams.has('clientId')?data:{clients:[{id:'1',name:'Fictional Alpha'}]}});
  const body=route.request().postDataJSON();writes.push(body);
  if(failOnce&&!failed){failed=true;return route.fulfill({status:503,json:{error:'The incident could not be closed. Retry the same action.'}});}
  expect(body.action).toBe('release');expect(body.clientId).toBe('1');expect(body.runId).toBe(runId);expect(body.cost).toBeUndefined();
  Object.assign(data,{runs:[],code:'available',usageState:undefined,canGenerate:true,message:'AI credits are available.',fetchedAt:'fixture-2'});return route.fulfill({json:{ok:true}});
 });return {data,writes};
}
test('Admin can close a technical incident without entering a cost or changing credits',async({page},info)=>{
 const f=await fixture(page);await page.goto('/admin/plans?client=1');const incident=page.getByRole('region',{name:'AI service needs attention',exact:true});await expect(incident).toBeVisible();await expect(page.getByText('Contact administrator',{exact:true})).toBeVisible();await expect(page.getByLabel('Verified provider cost (USD)')).toHaveCount(0);await expect(page.getByLabel('Reconciliation reason')).toHaveCount(0);expect(f.writes).toHaveLength(0);
 const box=await incident.boundingBox(),planBox=await page.getByRole('region',{name:'Saved monthly plan'}).boundingBox();expect(box.y).toBeLessThan(planBox.y);
 await incident.getByRole('button',{name:'Close without charging client',exact:true}).click();expect(f.writes).toHaveLength(0);await expect(incident.getByRole('status')).toContainText('does not assert that the provider charged zero');await incident.screenshot({path:info.outputPath('technical-incident.png')});
 await incident.getByRole('button',{name:'Confirm close without client charge',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Incident closed'})).toBeVisible();await expect(incident).toHaveCount(0);await expect(page.getByText('1,149.51',{exact:true})).toBeVisible();expect(f.writes).toHaveLength(1);expect(f.data.month.used_credits).toBe('0.485675');
});
test('A current reply still blocks concurrency and cannot be manually released',async({page})=>{
 const f=await fixture(page,{running:true});await page.goto('/admin/plans?client=1');await expect(page.getByText('Reply in progress',{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'AI reply in progress',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Close without charging client'})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});
test('Failed incident closure keeps the same retry key and never invents a success',async({page})=>{
 const f=await fixture(page,{failOnce:true});await page.goto('/admin/plans?client=1');const incident=page.getByRole('region',{name:'AI service needs attention',exact:true});await incident.getByRole('button',{name:'Close without charging client',exact:true}).click();await incident.getByRole('button',{name:'Confirm close without client charge',exact:true}).click();
 await expect(incident.getByRole('alert')).toContainText('could not be closed');await expect(page.getByText('Incident closed',{exact:true})).toHaveCount(0);await incident.getByRole('button',{name:'Confirm close without client charge',exact:true}).click();await expect(page.getByText('Incident closed',{exact:true})).toBeVisible();expect(f.writes).toHaveLength(2);expect(f.writes[0].idempotencyKey).toBe(f.writes[1].idempotencyKey);
});
test('Provider incidents show the actual HTTP code, curated explanation and request references',async({page},info)=>{
 await fixture(page,{providerIssue:true,recoverable:true});await page.goto('/admin/plans?client=1');await expect(page.getByText('1,149.51',{exact:true})).toBeVisible();await expect(page.getByText('Contact administrator',{exact:true})).toHaveCount(0);const incidents=page.getByRole('region',{name:'AI provider incidents',exact:true});await expect(incidents.getByText('insufficient_quota',{exact:true})).toBeVisible();await expect(incidents.getByRole('cell',{name:/^(?:HTTP status )?429$/})).toBeVisible();await expect(incidents).toContainText('Check the provider account billing');await incidents.getByText('Request references',{exact:true}).click();await expect(incidents.getByText('req_fixture',{exact:true})).toBeVisible();await incidents.screenshot({path:info.outputPath('provider-quota-incident.png')});
});
