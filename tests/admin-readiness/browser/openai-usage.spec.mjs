import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const period=new Date().toISOString().slice(0,7),date=period+'-02';
const data=()=>({configured:true,period,scope:{kind:'projects',projectIds:['proj_portal']},cacheSeconds:60,cached:false,fetchedAt:new Date().toISOString(),usage:{status:'ready',totals:{inputTokens:1000,outputTokens:100,cachedInputTokens:400,cacheWriteTokens:100,requests:2},rows:[{date,projectId:'proj_portal',model:'gpt-5.6-sol',inputTokens:1000,outputTokens:100,cachedInputTokens:400,cacheWriteTokens:100,requests:2}]},costs:{status:'ready',totalUsd:'0.012345678900',rows:[{date,projectId:'proj_portal',lineItem:'model usage',amountUsd:'0.012345678900'}]}});
async function fixture(page,{configured=true,costFailure=false,failRefresh=false,deniedRefresh=false,changedRefresh=false,twoModels=false}={}){
 let reportReads=0,failReads=false;const writes=[];
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());if(request.method()!=='GET')writes.push(url.pathname);
  if(url.pathname==='/api/admin/openai-usage'){
   reportReads++;
   if(changedRefresh&&failReads)return route.fulfill({status:409,json:{code:'reporting_connection_changed',error:'Connection changed'}});
   if(deniedRefresh&&failReads)return route.fulfill({status:403,json:{error:'Denied'}});
   if(failRefresh&&failReads)return route.fulfill({status:503,json:{error:'Provider report refresh failed.'}});
   const report=configured?{...data(),organizationId:'org-A',period:url.searchParams.get('month')}:{configured:false,period:url.searchParams.get('month'),scope:{kind:'organization',projectIds:[]},requiredConfiguration:['OPENAI_ADMIN_KEY'],setupMessage:'Connect an OpenAI organization Admin API key to view provider-reported dollars and tokens. Your paid chat key is separate.'};
   if(twoModels&&report.usage)report.usage.rows.push({date,projectId:'proj_other',model:'gpt-6-astra',inputTokens:300,outputTokens:30,cachedInputTokens:0,requests:1});
   if(costFailure)report.costs={status:'unavailable',code:'admin_permission_required',message:'The reporting key lacks access. Check its organization Usage and Costs read permissions.'};
   return route.fulfill({json:report});
  }
  if(url.pathname==='/api/admin/ai-usage')return route.fulfill({json:{provider:'openai',providerLabel:'OpenAI',clients:[],trackingReady:true,statusTrackingReady:true,activity:[],apiStatus:null,fetchedAt:new Date().toISOString()}});
  if(url.pathname==='/api/admin/ai-spending')return route.fulfill({json:{ready:true,period:url.searchParams.get('month'),clients:[],modelUsage:[{client:'Synthetic Client A',provider:'openai',model:'gpt-6-astra',organizationId:'org-A',projectId:'proj_A',requests:2,inputTokens:1000,outputTokens:100,knownUsd:'0.012345678900',unknownEvents:0,estimatedEvents:1},{client:'Synthetic Client B',provider:'openai',model:'gpt-6-luna',organizationId:null,projectId:null,requests:1,inputTokens:null,outputTokens:null,knownUsd:null,unknownEvents:1,estimatedEvents:0}],fetchedAt:new Date().toISOString()}});
  return route.fulfill({json:{ok:true,allowed:false}});
 });
 return {reads:()=>reportReads,writes,failNextRefresh:()=>{failReads=true;}};
}
test('Missing reporting configuration explains the separate key and never shows fabricated dollar totals',async({page},info)=>{
 const state=await fixture(page,{configured:false});await page.goto('/admin?view=usage');const report=page.getByRole('region',{name:'OpenAI usage & costs'});
 await expect(report.getByText('Connect reporting',{exact:true})).toBeVisible();await expect(report.getByText('OPENAI_ADMIN_KEY',{exact:true})).toBeVisible();await expect(report.getByText('Your paid chat key is separate.',{exact:false})).toBeVisible();await expect(report.getByText('$0.00',{exact:true})).toHaveCount(0);await expect(report.getByRole('button',{name:'Export OpenAI CSV'})).toBeDisabled();
 await expect(report.getByRole('img')).toHaveCount(3);await expect(report.locator('path[data-series]')).toHaveCount(0);await expect(report.getByText('Not connected',{exact:true}).first()).toBeVisible();await report.screenshot({path:info.outputPath('openai-usage-not-connected.png')});
 const initialReads=state.reads();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);expect(state.reads()).toBe(initialReads);
});
test('Admin report shows provider dollars, token/cache subsets, breakdowns and a safe CSV on desktop and mobile',async({page},info)=>{
 const state=await fixture(page);await page.goto('/admin?view=usage');const report=page.getByRole('region',{name:'OpenAI usage & costs'});
 await expect(report.getByText('$0.012346',{exact:true}).first()).toBeVisible();await expect(report.getByText('1,000',{exact:true}).first()).toBeVisible();await expect(report.getByText('400',{exact:true}).first()).toBeVisible();await expect(report.getByText('Selected OpenAI projects',{exact:true})).toBeVisible();
 const chart=report.getByRole('img',{name:/^OpenAI spending history/});await expect(chart).toBeVisible();await expect(report.locator('path[data-series=cost]')).not.toHaveCount(0);await chart.focus();await chart.press('Home');await chart.press('ArrowRight');await expect(report.getByRole('status')).toContainText('$0.012346');await chart.press('Enter');await expect(report.locator('[aria-label="Selected day usage"]')).toContainText('$0.012346');await chart.press('Escape');await report.getByRole('button',{name:'Clear date selection'}).click();await expect(report.locator('[aria-label="Selected day usage"]')).toHaveCount(0);
 await chart.scrollIntoViewIfNeeded();const box=await chart.boundingBox(),days=new Date().getUTCDate(),position={x:66+(box.width-80)/Math.max(1,days-1),y:100};await chart.hover({position});await expect(report.getByRole('status')).toContainText('$0.012346');await chart.click({position});await expect(report.locator('[aria-label="Selected day usage"]')).toContainText('UTC');await report.getByRole('button',{name:'Clear date selection'}).click();
 await expect(report.getByRole('table',{name:'OpenAI token usage'})).toBeVisible();await report.locator('summary').filter({hasText:'Costs by day and category'}).click();await expect(report.getByRole('table',{name:'OpenAI reported costs'})).toBeVisible();
 const downloadPromise=page.waitForEvent('download');await report.getByRole('button',{name:'Export OpenAI CSV'}).click();const download=await downloadPromise;const csv=await readFile(await download.path(),'utf8');expect(csv).toContain('0.012345678900');expect(csv).toContain('gpt-5.6-sol');expect(csv).not.toContain('Bearer');expect(csv).not.toContain('OPENAI_ADMIN_KEY');
 const dimensions=await report.evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth}));expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width+2);expect(state.writes.filter(path=>path!=='/api/admin/audit-events')).toEqual([]);await report.screenshot({path:info.outputPath('openai-usage.png')});
});
test('Costs permission failure preserves token totals and shows unavailable instead of a zero cost',async({page})=>{
 await fixture(page,{costFailure:true});await page.goto('/admin?view=usage');const report=page.getByRole('region',{name:'OpenAI usage & costs'});
 await expect(report.getByRole('alert')).toContainText('Costs unavailable.');await expect(report.getByText('1,000',{exact:true}).first()).toBeVisible();await expect(report.getByText('Unavailable',{exact:true}).first()).toBeVisible();await expect(report.getByText('$0.00',{exact:true})).toHaveCount(0);
});
test('Refresh failure preserves clearly labeled prior figures without restarting the report on focus',async({page})=>{
 const state=await fixture(page,{failRefresh:true});await page.goto('/admin?view=usage');const report=page.getByRole('region',{name:'OpenAI usage & costs'});await expect(report.getByText('$0.012346',{exact:true}).first()).toBeVisible();state.failNextRefresh();await report.getByRole('button',{name:'Refresh OpenAI report'}).click();await expect(report.getByRole('alert')).toContainText('Last successful figures remain visible.');await expect(report.getByText('$0.012346',{exact:true}).first()).toBeVisible();
});

test('Losing Admin permission clears displayed organization figures and disables export',async({page})=>{
 const state=await fixture(page,{deniedRefresh:true});await page.goto('/admin?view=usage');const report=page.getByRole('region',{name:'OpenAI usage & costs'});
 await expect(report.getByText('$0.012346',{exact:true}).first()).toBeVisible();state.failNextRefresh();await report.getByRole('button',{name:'Refresh OpenAI report'}).click();
 await expect(report.getByRole('alert')).toContainText('Sign in with an active AOC Admin account');await expect(report.getByText('$0.012346',{exact:true})).toHaveCount(0);await expect(report.getByRole('button',{name:'Export OpenAI CSV'})).toBeDisabled();
});

test('A changed connection clears old project figures instead of displaying stale cached spending',async({page})=>{
 const state=await fixture(page,{changedRefresh:true});await page.goto('/admin?view=usage');const report=page.getByRole('region',{name:'OpenAI usage & costs'});await expect(report.getByText('$0.012346',{exact:true}).first()).toBeVisible();state.failNextRefresh();await report.getByRole('button',{name:'Refresh OpenAI report'}).click();await expect(report.getByRole('alert')).toContainText('The OpenAI connection changed');await expect(report.getByText('$0.012346',{exact:true})).toHaveCount(0);await expect(report.getByRole('button',{name:'Export OpenAI CSV'})).toBeDisabled();
});

test('Model selection changes token/request charts while costs and identity columns stay clear',async({page})=>{
 await fixture(page,{twoModels:true});await page.goto('/admin?view=usage');const report=page.getByRole('region',{name:'OpenAI usage & costs'});await expect(report.getByText('1,430',{exact:true})).toBeVisible();await report.getByLabel('Chart model',{exact:true}).selectOption('gpt-5.6-sol');await expect(report.getByText('$0.012346',{exact:true}).first()).toBeVisible();await expect(report.getByText(/GPT 5.6 Sol · Cached input/)).toBeVisible();await expect(report.getByRole('columnheader',{name:'Organization ID',exact:true})).toHaveCount(1);await expect(report.getByRole('cell',{name:'org-A',exact:true}).first()).toBeVisible();await expect(report.getByRole('cell',{name:'proj_portal',exact:true}).first()).toBeVisible();await report.getByLabel('Chart model',{exact:true}).selectOption('gpt-6-astra');await expect(report.getByText('330',{exact:true})).toBeVisible();await expect(report.getByText(/GPT 6 Astra · Cached input/)).toBeVisible();await expect(report.getByText('$0.012346',{exact:true}).first()).toBeVisible();
});

test('Portal client/model records show actual client attribution and preserve unknown historical IDs',async({page})=>{
 await fixture(page);await page.goto('/admin?view=usage');const table=page.getByRole('table',{name:/Client and model usage/});await expect(table.getByRole('cell',{name:'Synthetic Client A',exact:true})).toBeVisible();await expect(table.getByRole('cell',{name:'org-A',exact:true})).toBeVisible();await expect(table.getByRole('cell',{name:'Not recorded',exact:true})).toHaveCount(2);await expect(table.getByRole('cell',{name:'Partial subtotal',exact:true})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export client/model CSV',exact:true}).click();const file=await download;const csv=await readFile(await file.path(),'utf8');expect(csv).toContain('Synthetic Client A');expect(csv).toContain('gpt-6-astra');expect(csv).toContain('Not recorded');expect(file.suggestedFilename()).toContain('client-model-usage');
});
