import {test,expect} from '@playwright/test';

function report() {
  return {ready:true,clientId:'1',period:'2026-11',range:{start:'2026-11-01T00:00:00.000Z',end:'2026-12-01T00:00:00.000Z'},
    pricing:{id:'1',pricingType:'percentage',aocFee:'40',creditsPerUsd:'1000',effectivePeriod:'2026-11'},
    pricingExample:{apiCostUsd:'1',aocFeeUsd:'0.4',totalClientCostUsd:'1.4',creditsUsed:'1400'},
    availableCredits:null,allocatedCredits:'1100',creditsUsed:'5.613146',aiUsageCredits:'5.613146',fixedFeeCredits:'0',fixedFeeUsd:'0',incomplete:true,unpricedEvents:5,missingTurns:0,pendingUsageEvents:0,
    estimatedEvents:1,partialHistory:false,trackingStartedAt:'2026-10-01T00:00:00.000Z',fetchedAt:new Date().toISOString(),
    transactions:[{kind:'allocation',credits:'100',api_cost_usd:null,aoc_fee_usd:null,basis:'manual',occurred_at:'2026-11-17T00:00:00.000Z'},
      {kind:'usage',credits:null,api_cost_usd:null,aoc_fee_usd:null,basis:'unknown',status:'failed',occurred_at:'2026-11-16T00:00:00.000Z'}],
    history:[],months:[],unpricedBreakdown:[],hasMoreTransactions:false,offset:0,group:'day',transactionAsOf:new Date().toISOString(),
    openaiCostUsd:'0.004',openrouterCostUsd:'0',toolCostUsd:'0',aocFeeUsd:'0.0016',totalClientCostUsd:null,inputTokens:'100',outputTokens:'20',cachedTokens:'0'};
}
async function fixture(page,{state='incomplete'}={}) {
  const data=report();
  if(state==='zero')Object.assign(data,{availableCredits:'0',incomplete:false,unpricedEvents:0,creditsUsed:'1100'});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let body={ok:true};
    if(url.pathname==='/api/credits') {
      if(state==='error')return route.fulfill({status:503,json:{error:'Credits are temporarily unavailable.'}});
      body={...data,period:url.searchParams.get('month') || '2026-11',offset:Number(url.searchParams.get('offset') || 0),group:url.searchParams.get('group') || 'day'};
    }else if(url.pathname==='/api/hubstaff')body={configured:true,project:{name:'Fixture Project',url:'https://example.com'},hours:{used:20,limit:20,remaining:0,budgetSpent:20,budgetRecurrence:'monthly'},source:{monthStart:'2026-11-01',monthEnd:'2026-11-17',timeZone:'Asia/Manila',fetchedAt:new Date().toISOString()}};
    else if(url.pathname==='/api/hubstaff/workflow')body={configured:true,columns:[{id:'notes',name:'Notes',stage:'other',taskCount:2},{id:'doing',name:'Doing',stage:'in_progress',taskCount:3},{id:'review',name:'Client review',stage:'review',taskCount:5},{id:'ideas',name:'Ideas',stage:'other',taskCount:1}]};
    else if(url.pathname==='/api/client-library')body={items:[]};
    else if(url.pathname==='/api/client-documents')body={clientId:'1',items:[],journey:null,hasMore:false};
    else if(url.pathname==='/api/client/website-insights')body={websites:[]};
    else if(url.pathname==='/api/client/members')body={members:[],events:[]};
    else if(url.pathname==='/api/client/audit')body={events:{rows:[{id:1,kind:'document',action:'client.document.add',actor_name:'Fixture User',target_name:'Brief',occurred_at:'2026-11-17T00:00:00.000Z'}]},usage:{rows:[]},pagination:{eventPage:1,usagePage:1}};
    await route.fulfill({json:body});
  });
  return data;
}

test('all client modules fit desktop and mobile without horizontal page overflow',async({page},info)=>{
  test.setTimeout(120000);
  await fixture(page);
  const failures=[];page.on('pageerror',error=>failures.push(error.message));
  for(const view of ['dashboard','website-insights','time','projects','documents','members','audit','account']){
    await page.goto('/?view='+view+'&role='+(view==='dashboard'?'client_viewer':'client_admin'));
    await expect(page.getByRole('main')).toBeVisible();
    if(view==='website-insights')await expect(page.locator('#website-insights-title')).toBeVisible();
    if(view==='documents')await expect(page.getByRole('region',{name:'Official client documents and journey'})).toContainText('Your journey');
    if(view==='members')await expect(page.getByRole('heading',{name:'Members & Access',exact:true,level:1})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' page overflow').toBe(true);
    const credit=await page.getByRole('button',{name:'AI Credits navigation',exact:true}).boundingBox();
    const account=await page.getByRole('button',{name:'Sign out',exact:true}).boundingBox();
    expect(credit && account && credit.x<account.x+account.width && credit.x+credit.width>account.x && credit.y<account.y+account.height && credit.y+credit.height>account.y,view+' header controls overlap').toBe(false);
    await page.screenshot({path:info.outputPath('client-'+view+'.png'),fullPage:true,caret:'initial'});
  }
  expect(failures).toEqual([]);
});

test('AI-only navigation skips Hubstaff polling and sidebar changes do not reload the document',async({page},info)=>{
  await fixture(page);
  await page.route('https://cdn.platform.openai.com/**',route=>route.fulfill({contentType:'application/javascript',body:"if(!customElements.get('openai-chatkit'))customElements.define('openai-chatkit',class extends HTMLElement {setOptions(){} async setThreadId(){}});"}));
  await page.route('**/api/ai-access',route=>route.fulfill({json:{ai:{enabled:true,uploadsEnabled:false}}}));
  await page.route('**/api/conversations',route=>route.fulfill({json:{conversations:[]}}));
  let hubstaff=0,documents=0;
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/hubstaff'))hubstaff++;if(request.resourceType()==='document')documents++;});
  await page.goto('/?view=ai');
  await expect(page.getByRole('heading',{name:'AOC AI',exact:true,level:1})).toBeVisible();
  if(info.project.name==='touch')await page.locator('details').filter({has:page.locator('nav[aria-label="Mobile client portal"]')}).locator('summary').click();
  await page.getByRole('link',{name:'Account',exact:true}).click();
  await expect(page.getByRole('main')).toContainText('This page changes your password only');
  expect(hubstaff).toBe(0);
  expect(documents).toBe(1);
});

test('workspace switching is available on mobile, retries failures, and resets the account controls',async({page,context})=>{
  const data=await fixture(page);
  await page.route('**/api/credits?**',route=>route.fulfill({json:{...data,clientId:route.request().headers()['x-aoc-client'] || '1'}}));
  let changes=0;
  await page.route('**/api/session/client',async route=>{
    changes++;
    if(changes===1)return route.fulfill({status:503,json:{error:'Synthetic temporary failure'}});
    await context.addCookies([{name:'fixture_workspace',value:'second',url:'http://127.0.0.1:3115'}]);
    return route.fulfill({json:{ok:true}});
  });
  await page.goto('/?view=account&multi=1');
  const workspace=page.getByRole('combobox',{name:'Active client account'});
  await expect(workspace).toBeVisible();
  await workspace.selectOption('second');
  await expect(page.locator('header [role="alert"]')).toContainText('This workspace could not be opened');
  await expect(workspace).toBeEnabled();
  await workspace.selectOption('second');
  await expect(workspace).toHaveValue('second');
  await expect(workspace).toBeEnabled();
  await expect(page.getByRole('link',{name:'Members & Access',exact:true})).toHaveCount(0);
  await expect(page.locator('header [role="alert"]')).toHaveCount(0);
  await page.route('**/api/auth/sign-out',route=>route.fulfill({status:503,json:{message:'Synthetic sign-out failure'}}));
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.locator('header [role="alert"]')).toContainText('Sign-out could not finish');
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe('/');
});

test('credits remain clear, unknown costs are not zero, and details work with keyboard or touch',async({page},info)=>{
  await fixture(page);await page.goto('/credits');
  await expect(page.getByRole('heading',{name:'Credits & usage'})).toBeVisible();
  const main=page.getByRole('main');
  await expect(main.getByText('1,100',{exact:true})).toBeVisible();
  await expect(main.getByText('5.613146',{exact:true})).toBeVisible();
  const balance=page.getByRole('link',{name:'Credits: Not confirmed',exact:true});
  await expect(balance).toBeVisible();
  await expect(balance).toHaveAttribute('aria-current','page');
  if(info.project.name==='desktop') {await balance.hover();await expect(page.getByRole('menu')).toBeVisible();await page.mouse.move(10,10);await expect(page.getByRole('menu')).toHaveCount(0);}
  const details=page.getByRole('button',{name:'AI Credits navigation'});
  if(info.project.name==='touch')await details.tap();else await details.click();
  await expect(page.getByRole('menu',{name:'AI Credits'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
  await balance.focus();await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Credits Overview'})).toBeFocused();
  await page.keyboard.press('Escape');
  await main.getByRole('heading',{name:'Credits & usage'}).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await main.getByRole('link',{name:'Pricing Details',exact:true}).click();
  await expect(main.getByText('Illustrative example')).toBeVisible();
  await expect(main.getByText('1,400 credits',{exact:true})).toBeVisible();
  await main.getByRole('link',{name:'Credit Transactions',exact:true}).click();
  await expect(main.getByRole('cell',{name:'Not applicable'})).toHaveCount(2);
  await expect(main.getByText('Unsuccessful AI request · cost details missing')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.evaluate(()=>window.innerWidth));
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:info.outputPath('credits.png'),fullPage:true,caret:'initial'});
  await balance.click();await expect(page).toHaveURL(/\/credits$/);
});
test('confirmed usage and cross-tab allowance updates refresh the header and page together',async({page})=>{
  const data=await fixture(page,{state:'zero'});Object.assign(data,{availableCredits:'1000',creditsUsed:'100'});
  await page.goto('/credits');await expect(page.getByRole('link',{name:'Credits: 1,000',exact:true})).toBeVisible();
  Object.assign(data,{availableCredits:'950',creditsUsed:'150'});
  await page.evaluate(()=>window.dispatchEvent(new Event('aoc:ai-usage-changed')));
  await expect(page.getByRole('link',{name:'Credits: 950',exact:true})).toBeVisible();
  await expect(page.getByRole('main').getByText('950',{exact:true})).toBeVisible();
  Object.assign(data,{availableCredits:'1150',allocatedCredits:'1300'});
  await page.evaluate(()=>{const channel=new BroadcastChannel('aoc-credits-updated');channel.postMessage({clientId:'1'});channel.close();});
  await expect(page.getByRole('link',{name:'Credits: 1,150',exact:true})).toBeVisible();
  await expect(page.getByRole('main').getByText('1,300',{exact:true})).toBeVisible();
});
test('verified zero and API failures have different header states',async({page})=>{
  await fixture(page,{state:'zero'});await page.goto('/credits');
  await expect(page.getByRole('link',{name:'Credits: 0',exact:true})).toBeVisible();
  await page.unroute('**/api/**');await fixture(page,{state:'error'});await page.reload();
  await expect(page.getByRole('link',{name:'Credits: Unavailable',exact:true})).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('temporarily unavailable');
});
test('client pages stay inside main, role navigation is preserved, search works and controls are honest',async({page},info)=>{
  await fixture(page);await page.goto('/?view=documents&role=client_viewer');
  await expect(page.getByRole('main')).toContainText('No documents have been added yet.');
  await expect(page.getByRole('main').getByRole('heading',{name:'Documents',exact:true,level:1})).toBeVisible();
  await expect(page.locator('nav[aria-label="Client portal"] a[aria-current="page"]')).toHaveText('Documents');
  await expect(page.getByRole('link',{name:'AOC AI',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Add reference',exact:true})).toHaveCount(0);
  const search=page.getByRole('searchbox',{name:'Find a portal page'});await search.fill('credits');
  await expect(page.getByRole('navigation',{name:'Matching portal pages'}).getByRole('link',{name:'Credits & usage'})).toBeVisible();
  await search.press('Escape');await expect(page.getByRole('navigation',{name:'Matching portal pages'})).toHaveCount(0);
  await page.getByLabel('Notification availability').click();await expect(page.getByText('Notifications are not connected yet.',{exact:false})).toBeVisible();
  await page.getByText('Privacy Policy',{exact:true}).click();await expect(page.getByText('A policy link has not been added to this portal yet.',{exact:false})).toBeVisible();
  await page.goto('/?view=time&role=member');await expect(page.getByRole('main')).toContainText('Tracked time and available Hubstaff budgets are shown for this project.');
  await expect(page.getByRole('main')).toContainText('Asia/Manila');
  await page.goto('/?view=projects&role=member');await expect(page.getByRole('main')).toContainText('5 tasks are awaiting client review.');
  await expect(page.getByRole('main')).toContainText('8 active work tasks');
  await expect(page.getByRole('main').getByRole('button').first()).toContainText('Client review');
  await page.goto('/?view=members');await expect(page.getByRole('main')).toContainText('This creates a login, not an email invitation.');
  await page.goto('/?view=audit');await expect(page.getByRole('main')).toContainText('Reference added');
  await page.goto('/?view=account');await expect(page.getByRole('main')).toContainText('This page changes your password only');
  await expect(page.getByRole('link',{name:'Credits',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('account.png'),fullPage:true,caret:'initial'});
});

test('Hubstaff hours and cost budgets remain visible independently of AI credits',async({page},info)=>{
  await fixture(page);await page.goto('/?view=dashboard&role=client_viewer');
  // The restored fourth card must show an actual zero, not a missing value.
  await expect(page.getByText('Hours Remaining',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('20 of 20 hrs used / 20 hr monthly limit',{exact:true})).toBeVisible();
  await expect(page.getByText('100%',{exact:true})).toBeVisible();
  await page.route('**/api/hubstaff',route=>route.fulfill({json:{configured:true,project:{name:'Fixture Project',url:'https://example.com'},
    hours:{used:20,limit:null,remaining:null},costBudget:{limit:100,spent:20,remaining:80,currency:'USD',recurrence:'monthly',remainingHours:4,remainingMinutes:240},
    source:{monthStart:'2026-11-01',monthEnd:'2026-11-17',timeZone:'Asia/Manila',fetchedAt:new Date().toISOString()}}}));
  await page.reload();await expect(page.getByText('$80 remains from the $100 monthly budget',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('hubstaff-budget-restored.png'),fullPage:true});
});

test('an admin AI reset makes all 600 assigned credits visible in both header and overview',async({page},info)=>{
  const data=await fixture(page);await page.goto('/credits');
  await expect(page.getByRole('link',{name:'Credits: Not confirmed',exact:true})).toBeVisible();
  Object.assign(data,{availableCredits:'600',allocatedCredits:'600',creditsUsed:'0',incomplete:false,unpricedEvents:0,missingTurns:0,
    pendingUsageEvents:0,estimatedEvents:0,usageResetAt:new Date().toISOString(),apiCostUsd:'0',openaiCostUsd:'0',openrouterCostUsd:'0',
    aocFeeUsd:'0',totalClientCostUsd:'0',inputTokens:'0',outputTokens:'0',cachedTokens:'0',history:[],months:[],transactions:[data.transactions[0]]});
  await page.evaluate(()=>{const channel=new BroadcastChannel('aoc-credits-updated');channel.postMessage({all:true,reset:true});channel.close();});
  await expect(page.getByRole('link',{name:'Credits: 600',exact:true})).toBeVisible();
  await expect(page.locator('#overview')).toContainText('AI usage reporting was reset');
  await expect(page.locator('#overview').getByText('600',{exact:true})).toHaveCount(2);
  await expect(page.locator('#overview')).not.toContainText('We cannot confirm');
  await page.getByRole('link',{name:'Usage History',exact:true}).click();
  await expect(page.locator('#history')).toContainText('No API activity recorded for this period.');
  await page.screenshot({path:info.outputPath('credits-after-ai-reset.png'),fullPage:true});
});

test('client sees no AI consumption when only a fixed service fee is recorded',async({page})=>{
  const data=await fixture(page);
  Object.assign(data,{pricing:{...data.pricing,pricingType:'fixed',aocFee:'200'},allocatedCredits:null,availableCredits:null,
    aiUsageCredits:'0',fixedFeeCredits:'200000',fixedFeeUsd:'200',creditsUsed:'200000',incomplete:false,unpricedEvents:0});
  await page.goto('/?view=credits');
  const cards=page.getByLabel('Credit breakdown');
  await expect(cards.locator('article').filter({hasText:'AI usage credits'}).locator('strong')).toHaveText('0');
  await expect(cards.locator('article').filter({hasText:'Monthly AOC fee'}).locator('strong')).toHaveText('200,000');
  await expect(cards.getByText('Allowance not set',{exact:true})).toBeVisible();
});

test('client add, remove and security actions use purpose colors plus text cues',async({page},info)=>{
 await fixture(page);
 await page.route('**/api/client/members',route=>route.fulfill({json:{members:[{id:'99',name:'Example Member',username:'example.member',role:'member',active:true}],events:[]}}));
 await page.goto('/?view=members');
 const addForm=page.getByRole('heading',{name:'Create a client login',exact:true}).locator('..');
 await expect(addForm.getByText('Add a client login',{exact:true})).toBeVisible();await expect(addForm).toHaveCSS('border-inline-start-color','rgb(4, 120, 87)');
 await expect(page.getByRole('button',{name:'Deactivate',exact:true})).toHaveCSS('background-color','rgb(180, 35, 24)');
 await page.goto('/?view=account');
 const security=page.getByRole('heading',{name:'Password & sign-in security',exact:true}).locator('..');
 await expect(security.getByText('Caution · Account security',{exact:true})).toBeVisible();await expect(security).toHaveCSS('border-inline-start-color','rgb(146, 64, 14)');
 await security.screenshot({path:info.outputPath('account-security-caution.png')});
});
