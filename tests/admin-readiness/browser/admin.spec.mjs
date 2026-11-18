import {test,expect} from '@playwright/test';
const period='2026-11',next='2026-12';
const versions=[{id:'2',pricingType:'percentage',aocFee:'20.000000000000',creditsPerUsd:'1000.000000000000',effectivePeriod:next,createdAt:'2026-11-17T00:00:00Z'},
  {id:'1',pricingType:'percentage',aocFee:'40.000000000000',creditsPerUsd:'1000.000000000000',effectivePeriod:period,createdAt:'2026-11-01T00:00:00Z'}];
async function fixture(page,{failSave=false,failAdjustment=false,reasonsReady=true}={}) {
  const mutations=[],reads=[];let adjustmentSaved=false;
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),method=route.request().method();let body={ok:true};
    if(method!=='GET')mutations.push({path:url.pathname,body:route.request().postDataJSON()});else reads.push(url.pathname);
    if(url.pathname==='/api/admin/presence')body={clients:[]};
    else if(url.pathname==='/api/admin/credits' && method==='GET') {
      if(!url.searchParams.has('clientId'))body={mode:'reporting_only',currentPeriod:period,editorPeriod:next,versions,current:versions[1],scheduled:[versions[0]],reasonsReady,clients:[{id:'1',name:'Alpha Client'},{id:'2',name:'Beta Client'}]};
      else {const id=url.searchParams.get('clientId');body={ready:true,clientId:id,client:{id,name:id==='1'?'Alpha Client':'Beta Client'},period:url.searchParams.get('month') || period,
        pricing:versions[1],allocatedCredits:adjustmentSaved?'1200':'1100',creditsUsed:'5.613146',availableCredits:null,incomplete:true,estimatedEvents:1,
        unpricedEvents:5,pendingUsageEvents:0,missingTurns:0,adjustments:adjustmentSaved?[{kind:'allocation',credits:'100',reason:'Approved allowance extension',recorded_at:new Date().toISOString()}]:[]};}
    }else if(url.pathname==='/api/admin/credits') {
      const input=route.request().postDataJSON();
      if(input.action==='preview') {const amount=Number(input.apiCostUsd),fee=input.pricingType==='fixed'?Number(input.aocFee):amount*Number(input.aocFee)/100;
        body={apiCostUsd:String(amount),aocFeeUsd:String(fee),totalClientCostUsd:String(amount+fee),creditsUsed:String((amount+fee)*Number(input.creditsPerUsd))};}
      else if(input.action==='adjustment_preview')body={change:input.amount,allocatedAfter:'1200',availableAfter:null};
      else if(input.action==='allocation'){if(failAdjustment)return route.fulfill({status:503,json:{error:'Fixture: response lost; retry the same adjustment.'}});adjustmentSaved=true;body={recorded:true,duplicate:false};}
      else body={pricing:{effectivePeriod:next}};
    }else if(url.pathname==='/api/admin/clients' && method==='PATCH') {
      if(failSave)return route.fulfill({status:400,json:{error:'Fixture validation failure. Entered values are preserved.'}});
      const draft=route.request().postDataJSON();body={client:{...draft,id:'1',slug:draft.slug,requestsUsed:9,requestsRemaining:141,memberCount:1,conversationCount:7,approvedKnowledge:0,pendingKnowledge:0,members:[]}};
    }else if(url.pathname==='/api/admin/client-operations')body={clientId:url.searchParams.get('clientId'),websitesReady:true,websites:[{name:'Main store',url:'https://example.com/'},{name:'Second store',url:'https://shop.example.com/'}]};
    else if(url.pathname==='/api/admin/ai-usage')body={clients:[{id:'1',name:'Alpha Client',used:9,enabled:true},{id:'2',name:'Beta Client',used:2,enabled:true}],apiStatus:null,fetchedAt:new Date().toISOString()};
    else if(url.pathname==='/api/admin/ai-spending')body={ready:true,period:url.searchParams.get('month'),clients:[],fetchedAt:new Date().toISOString()};
    else if(url.pathname==='/api/admin/ai-usage/history') {
      const input=route.request().postDataJSON();
      if(input.action==='preview')body={token:'signed-fixture-cutoff',label:'Alpha Client',period:input.period,before:new Date().toISOString(),requests:9,inputTokens:'900',outputTokens:'100',unreported:0,costEvents:9,knownUsd:'0.25',unpriced:1,clients:1,scope:'client',clientId:'1'};
      else if(mutations.filter(call=>call.path==='/api/admin/ai-usage/history' && call.body.action==='clear').length===1)
        return route.fulfill({status:503,json:{error:'Fixture response lost. Retry the same preview.'}});
      else body={cleared:9,costsCleared:9,clientsReset:1,scope:'client',clientId:'1',reset:true};
    }
    else if(url.pathname==='/api/admin/usage')body={client:{id:'1',slug:'alpha',name:'Alpha Client',portalEnabled:true,aiEnabled:true,monthlyPromptLimit:150,requestsUsed:0,requestsRemaining:150,vectorStoreId:'',hubstaffProjectUrl:'',memberCount:1,conversationCount:7,approvedKnowledge:0,pendingKnowledge:0,members:[]}};
    else return route.fulfill({status:503,json:{error:'Fixture service unavailable; no real integration request was sent.'}});
    return route.fulfill({json:body});
  });return {mutations,reads};
}
async function openNav(page,info) {if(info.project.name==='touch')await page.getByRole('button',{name:'Open administrator menu'}).tap();}
test('Clients has focused sections, preserves unsaved edits across clients and navigation, without a monthly AI request ceiling',async({page},info)=>{
  const state=await fixture(page,{failSave:true});await page.goto('/admin?view=clients&client=alpha');
  await expect(page.getByRole('heading',{name:'Clients',exact:true,level:1})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Alpha Client',exact:true})).toBeVisible();
  await expect(page.getByText('9 recorded AI chats this month')).toHaveCount(2);
  await expect(page.getByRole('spinbutton',{name:'Request ceiling per UTC month'})).toHaveCount(0);
  await page.getByLabel('Client display name').fill('Alpha edited');
  await expect(page.getByText('@alpha · Unsaved changes')).toBeVisible();
  await page.getByRole('button',{name:/Beta Client @beta/}).click();
  await expect(page.getByRole('heading',{name:'Beta Client',exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByLabel('Client display name')).toHaveValue('Alpha edited');
  await page.getByRole('link',{name:'AI Usage & Credits',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI chat usage',exact:true})).toBeVisible();
  await expect(page.getByRole('spinbutton',{name:'Request ceiling per UTC month'})).toHaveCount(0);
  await expect(page.getByText('There is no portal monthly AI request cap.',{exact:false})).toBeVisible();
  await page.getByRole('link',{name:'Overview',exact:true}).last().click();
  await page.getByRole('button',{name:'Save client',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Fixture validation failure');
  await expect(page.getByLabel('Client display name')).toHaveValue('Alpha edited');
  const save=state.mutations.find(call=>call.path==='/api/admin/clients');expect(save.body.monthlyPromptLimit).toBeUndefined();
  expect(state.mutations.some(call=>call.path==='/api/admin/usage')).toBe(false);
  await page.getByRole('link',{name:'AI Usage & Credits',exact:true}).click();
  await expect(page.getByRole('link',{name:"Clear this client's AI chat usage history"})).toHaveAttribute('href','/admin?view=usage&usageClient=1');
  await expect(page.getByRole('button',{name:'Reset current monthly usage',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Overview',exact:true}).last().click();await expect(page.getByLabel('Client display name')).toHaveValue('Alpha edited');
  await openNav(page,info);await page.getByRole('link',{name:'AI Pricing & Credits',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI Pricing & Credits',exact:true,level:1})).toBeVisible();
  await page.goBack();await expect(page.getByLabel('Client display name')).toHaveValue('Alpha edited');
  expect(state.reads.includes('/api/admin/provider-settings')).toBe(false);
  await page.screenshot({path:info.outputPath('clients.png'),fullPage:true,caret:'initial'});
});
test('current and scheduled pricing stay distinct, fee types are not reinterpreted, and previews do not save',async({page},info)=>{
  const state=await fixture(page);await page.goto('/admin/credits?client=1&month=2026-11');
  const summaries=page.getByRole('region',{name:'Current and scheduled pricing'});
  await expect(summaries).toContainText('40% markup');await expect(summaries).toContainText('20% markup');
  await expect(page.getByRole('heading',{name:'Edit scheduled pricing · December 2026 UTC'})).toBeVisible();
  await expect(page.getByLabel('AOC markup · percent')).toHaveValue('20');
  await page.getByRole('combobox',{name:'Pricing type',exact:true}).selectOption('fixed');
  await expect(page.getByLabel('AOC fixed fee · USD per billing month')).toHaveValue('');
  await page.getByLabel('AOC fixed fee · USD per billing month').fill('2.5');
  await page.getByRole('button',{name:'Calculate pricing preview'}).click();
  await expect(page.getByRole('definition').filter({hasText:'3,500'})).toBeVisible();
  await page.getByRole('combobox',{name:'Pricing type',exact:true}).selectOption('percentage');
  await expect(page.getByLabel('AOC markup · percent')).toHaveValue('20');
  expect(state.mutations.every(call=>call.body.action==='preview')).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:info.outputPath('pricing.png'),fullPage:true,caret:'initial'});
});
test('allowance changes show client scope, unknown balance, required reason and stable retry key',async({page},info)=>{
  const state=await fixture(page,{failAdjustment:true});await page.goto('/admin/credits?client=1&month=2026-11');
  await expect(page.getByRole('heading',{name:'Alpha Client · 2026-11 UTC'})).toBeVisible();
  await page.getByLabel('Amount · credits').fill('100');await page.getByLabel('Reason · admin audit trail').fill('Approved allowance extension');
  await page.getByRole('button',{name:'Preview allowance adjustment'}).click();
  await expect(page.getByRole('status').filter({hasText:'Proposed 100 credits'})).toContainText('Not confirmed');
  const save=page.getByRole('button',{name:'Record addition for 2026-11'});await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Fixture: response lost');
  await expect(page.getByLabel('Amount · credits')).toHaveValue('100');await expect(page.getByLabel('Reason · admin audit trail')).toHaveValue('Approved allowance extension');
  await openNav(page,info);await page.getByRole('link',{name:'Clients',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Clients',exact:true,level:1})).toBeVisible();await page.goBack();
  await expect(page.getByLabel('Amount · credits')).toHaveValue('100');await page.getByRole('button',{name:'Preview allowance adjustment'}).click();
  await save.click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Fixture: response lost');
  const calls=state.mutations.filter(call=>call.body.action==='allocation');expect(calls).toHaveLength(2);expect(calls[0].body.idempotencyKey).toBe(calls[1].body.idempotencyKey);
  expect(calls[0].body.reason).toBe('Approved allowance extension');
});
test('Back cannot reuse another client allowance preview',async({page})=>{
  await fixture(page);await page.goto('/admin/credits?client=1&month=2026-11');
  await page.getByLabel('Amount · credits').fill('100');await page.getByLabel('Reason · admin audit trail').fill('Alpha extension');
  await page.getByRole('button',{name:'Preview allowance adjustment'}).click();
  await expect(page.getByRole('button',{name:'Record addition for 2026-11'})).toBeEnabled();
  await page.getByRole('combobox',{name:'Selected client',exact:true}).selectOption('2');
  await expect(page.getByRole('heading',{name:'Beta Client · 2026-11 UTC'})).toBeVisible();
  await page.getByLabel('Amount · credits').fill('50');await page.getByLabel('Reason · admin audit trail').fill('Beta extension');
  await page.getByRole('button',{name:'Preview allowance adjustment'}).click();
  await expect(page.getByRole('button',{name:'Record addition for 2026-11'})).toBeEnabled();await page.goBack();
  await expect(page.getByRole('heading',{name:'Alpha Client · 2026-11 UTC'})).toBeVisible();
  await expect(page.getByLabel('Amount · credits')).toHaveValue('100');
  await expect(page.getByRole('button',{name:'Record addition for 2026-11'})).toBeDisabled();
  await expect(page.getByText('Proposed 50 credits',{exact:false})).toHaveCount(0);
});
test('scheduled price saves identify their period and missing reason migration blocks adjustments',async({page})=>{
  const state=await fixture(page,{reasonsReady:false});await page.goto('/admin/credits?client=1&month=2026-11');
  await page.getByLabel('AOC markup · percent').fill('25');await page.getByRole('button',{name:'Save pricing for 2026-12'}).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('Pricing version saved for 2026-12');
  const save=state.mutations.find(call=>call.body.action==='pricing');expect(save.body.effectivePeriod).toBe('2026-12');expect(save.body.expectedVersion).toBe('2');expect(save.body.aocFee).toBe('25');
  await expect(page.getByText('Adjustment audit reasons need an additive schema update.')).toBeVisible();
  await page.getByLabel('Amount · credits').fill('100');await page.getByLabel('Reason · admin audit trail').fill('Approved allowance extension');
  await page.getByRole('button',{name:'Preview allowance adjustment'}).click();
  await expect(page.getByRole('button',{name:'Record addition for 2026-11'})).toBeDisabled();
  expect(state.mutations.some(call=>call.body.action==='allocation')).toBe(false);
});
test('integration sections, current counters and compatible anchors remain explicit',async({page},info)=>{
  const state=await fixture(page);await page.goto('/admin#clients');
  await expect(page).toHaveURL(/view=clients/);await page.getByRole('link',{name:'Integrations',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Website Insights websites'})).toBeVisible();await expect(page.getByText('2 active monitored websites.')).toBeVisible();
  await expect(page.getByText('Make automation · portal-wide')).toBeVisible();
  await page.getByRole('link',{name:'Activity',exact:true}).click();await expect(page.getByText('ChatKit conversations')).toBeVisible();
  await expect(page.getByText('Latest thread creation or recorded AI request:')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.evaluate(()=>window.innerWidth));
  if(info.project.name==='touch'){await openNav(page,info);await expect(page.getByRole('dialog',{name:'Administrator navigation'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open administrator menu'})).toBeFocused();}
  expect(state.mutations).toHaveLength(0);
});

test('AI history reset previews scoped costs, retains assigned credits and keeps a stable confirmation on retry',async({page},info)=>{
  const state=await fixture(page);await page.goto('/admin?view=usage&usageClient=1');
  const panel=page.getByRole('region',{name:'Reset AI usage & credits',exact:true});
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('combobox',{name:'AI usage for'})).toHaveValue('client:1');
  await panel.getByRole('checkbox',{name:'All recorded history'}).check();
  await panel.getByRole('button',{name:'Preview AI usage reset'}).click();
  await expect(panel).toContainText('$0.25 known API usage');
  await expect(panel).toContainText('Reset archives that earlier usage');
  const clear=panel.getByRole('button',{name:'Reset selected AI usage and consumed credits'});
  await expect(clear).toBeDisabled();
  await panel.getByLabel('Type RESET to confirm').fill('RESET');
  await clear.click();await expect(panel.getByRole('alert')).toContainText('Fixture response lost');
  await expect(panel.getByLabel('Type RESET to confirm')).toHaveValue('RESET');
  await clear.click();await expect(panel.getByRole('status')).toContainText('AI usage and consumed credits reset for 1 client workspace(s)');
  const calls=state.mutations.filter(call=>call.path==='/api/admin/ai-usage/history');
  expect(calls[0].body).toEqual({action:'preview',scope:'client',clientId:'1',period:'all'});
  expect(calls[1].body.token).toBe(calls[2].body.token);
  expect(state.mutations.some(call=>call.path==='/api/admin/credits')).toBe(false);
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('ai-history-controls.png'),fullPage:true});
});
