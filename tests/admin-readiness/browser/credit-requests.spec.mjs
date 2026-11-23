import {test,expect} from '@playwright/test';
const period=new Date().toISOString().slice(0,7);
const REQUEST='8e35c4c4-97bd-43bc-970f-c2d5852e3420';
async function fixture(page,{paid=true,kind='credits',failDeclineOnce=false,failTopupOnce=false}={}) {
 const base=id=>({ready:true,mode:'subscription',configured:true,clientId:id,period,plan:{monthly_price:'150.00',monthly_credits:'1000',status:'active',version:'1'},month:paid?{monthly_price:'150.00',included_credits:'1000',extra_credits:'0',used_credits:'100'}:null,availableCredits:paid?'900':null,allocatedCredits:paid?'1000':null,creditsUsed:paid?'100':null,canGenerate:paid,message:paid?'AI credits are available.':'This month’s AI credits are waiting for admin payment confirmation.',requests:[],runs:[],audit:[],fetchedAt:new Date().toISOString()});
 const data={'1':base('1'),'2':base('2')},writes=[];
 data['1'].requests=[{id:REQUEST,kind,note:'200',status:'pending',created_at:'2026-11-23T08:00:00Z'}];
 let failures=0,revision=0;
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname!=='/api/admin/client-plan')return route.fulfill({json:{ok:true}});
  if(route.request().method()==='GET')return route.fulfill({json:url.searchParams.has('clientId')?data[url.searchParams.get('clientId')]:{clients:[{id:'1',name:'Fictional client A'},{id:'2',name:'Fictional client B'}]}});
  const body=route.request().postDataJSON();writes.push(body);const state=data[body.clientId];
  if((failDeclineOnce&&body.action==='decline'||failTopupOnce&&body.action==='topup')&&failures++===0)return route.fulfill({status:503,json:{error:'The decision could not be confirmed. Retry the same request.'}});
  if(body.action==='decline')state.requests.find(row=>row.id===body.requestId).status='declined';
  if(body.action==='topup'){state.month.extra_credits=String(Number(state.month.extra_credits)+Number(body.credits));state.availableCredits=String(Number(state.availableCredits)+Number(body.credits));if(body.requestId)Object.assign(state.requests.find(row=>row.id===body.requestId),{status:'approved',granted_credits:body.credits,granted_period:period});}
  if(body.action==='save'){state.plan={monthly_price:body.price,monthly_credits:body.credits,status:body.status,version:String(Number(state.plan.version)+1)};if(body.activate)state.month={monthly_price:body.price,included_credits:body.credits,extra_credits:'0',used_credits:'0'};}
  state.fetchedAt=String(++revision);return route.fulfill({json:{ok:true}});
 });
 return {data,writes};
}
const requestSection=page=>page.getByRole('region',{name:'Client requests',exact:true});
async function payment(page){await page.getByLabel('Extra AI credits',{exact:true}).fill('200');await page.getByLabel('Payment received (USD)',{exact:true}).fill('5');await page.getByLabel('Payment reference',{exact:true}).fill('FICTIONAL-RECEIPT');await page.getByLabel('Reason for credit addition',{exact:true}).fill('Agreed fictional addition');await page.getByLabel('I verified this payment outside the portal.',{exact:true}).check();}

test('pending request is above the forms and review links it without guessing amounts or charging',async({page},info)=>{
 const f=await fixture(page);await page.goto('/admin/plans?client=1');const queue=requestSection(page);await expect(queue.getByText('200',{exact:true})).toBeVisible();await expect(queue.getByText('1 pending',{exact:true})).toBeVisible();
 const queueBox=await queue.boundingBox(),formBox=await page.getByRole('region',{name:'Saved monthly plan',exact:true}).boundingBox();expect(queueBox.y).toBeLessThan(formBox.y);expect(f.writes).toHaveLength(0);
 expect(await queue.getByRole('table',{name:'Pending requests for this client',exact:true}).evaluate(node=>node.parentElement.scrollWidth<=node.parentElement.clientWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('request-inbox.png'),fullPage:true});
 await queue.getByRole('button',{name:'Review & add credits',exact:true}).click();await expect(page.getByRole('combobox',{name:'Related client request',exact:true})).toHaveValue(REQUEST);await expect(page.getByLabel('Extra AI credits',{exact:true})).toBeFocused();
 await expect(page.getByLabel('Extra AI credits',{exact:true})).toHaveValue('');await expect(page.getByLabel('Payment received (USD)',{exact:true})).toHaveValue('');await expect(page.getByRole('note')).toContainText('200');expect(f.writes).toHaveLength(0);
 await payment(page);await page.getByRole('button',{name:'Review credit addition',exact:true}).click();expect(f.writes).toHaveLength(0);await page.screenshot({path:info.outputPath('request-payment-review.png'),fullPage:true});
 await page.getByRole('button',{name:'Confirm paid credit addition',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'AI credits added'})).toContainText('linked request is closed with this recorded credit amount');
 expect(f.writes).toHaveLength(1);expect(f.writes[0]).toMatchObject({action:'topup',clientId:'1',requestId:REQUEST,credits:'200',paid:'5',paymentConfirmed:true});expect(f.data['1'].plan.monthly_price).toBe('150.00');await expect(queue.getByText('0 pending',{exact:true})).toBeVisible();await queue.getByText('Recent resolved requests (1)',{exact:true}).click();await expect(queue.getByText('Closed',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('unpaid month routes to activation and does not silently approve the extra-credit request',async({page})=>{
 const f=await fixture(page,{paid:false});await page.goto('/admin/plans?client=1');const queue=requestSection(page);await queue.getByRole('button',{name:'Activate monthly plan',exact:true}).click();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toBeFocused();await expect(page.getByRole('heading',{name:'Add paid credits',exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(0);
 await page.getByLabel('Payment reference',{exact:true}).fill('FICTIONAL-MONTH');await page.getByLabel('I verified the payment outside the portal.',{exact:true}).check();await page.getByLabel('Reason for this plan change',{exact:true}).fill('Activate fictional paid month');await page.getByRole('button',{name:'Review client plan',exact:true}).click();await page.getByRole('button',{name:'Confirm client plan',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Related client request',exact:true})).toHaveValue(REQUEST);await expect(queue.getByText('1 pending',{exact:true})).toBeVisible();expect(f.data['1'].requests[0].status).toBe('pending');expect(f.writes).toHaveLength(1);expect(f.writes[0].action).toBe('save');
});

test('decline requires confirmation and a reason; failed decision retry uses the same identity',async({page})=>{
 const f=await fixture(page,{failDeclineOnce:true});await page.goto('/admin/plans?client=1');const queue=requestSection(page);await queue.getByRole('button',{name:'Decline request',exact:true}).click();expect(f.writes).toHaveLength(0);await expect(queue.getByRole('button',{name:'Confirm decline',exact:true})).toBeDisabled();
 await queue.getByRole('button',{name:'Cancel',exact:true}).click();await expect(queue.getByRole('form',{name:'Confirm request decline'})).toHaveCount(0);expect(f.writes).toHaveLength(0);
 await queue.getByRole('button',{name:'Decline request',exact:true}).click();await queue.getByLabel('Reason for declining',{exact:true}).fill('Fictional request withdrawn');await queue.getByRole('button',{name:'Confirm decline',exact:true}).click();await expect(queue.getByRole('alert')).toContainText('could not be confirmed');expect(f.data['1'].requests[0].status).toBe('pending');
 await queue.getByRole('button',{name:'Confirm decline',exact:true}).click();await expect(queue.getByRole('status')).toContainText('Request declined');expect(f.writes).toHaveLength(2);expect(f.writes[0].idempotencyKey).toBe(f.writes[1].idempotencyKey);expect(f.writes[1]).toMatchObject({action:'decline',requestId:REQUEST,clientId:'1',reason:'Fictional request withdrawn'});expect(f.data['1'].month.extra_credits).toBe('0');
});

test('client switching clears request selection and cannot reuse another client’s payment form',async({page})=>{
 const f=await fixture(page);await page.goto('/admin/plans?client=1');await requestSection(page).getByRole('button',{name:'Review & add credits',exact:true}).click();await page.getByLabel('Extra AI credits',{exact:true}).fill('200');
 await page.getByRole('combobox',{name:'Client plan',exact:true}).selectOption('2');await expect(page).toHaveURL(/client=2/);await expect(page.getByRole('heading',{name:'Fictional client B',exact:true})).toBeVisible();await expect(requestSection(page).getByText('No requests awaiting review.',{exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Related client request',exact:true})).toHaveValue('');await expect(page.getByLabel('Extra AI credits',{exact:true})).toHaveValue('');await expect(page.getByRole('note')).toHaveCount(0);expect(f.writes).toHaveLength(0);
});

test('upgrade review opens monthly settings without automatically changing the plan or credits',async({page})=>{
 const f=await fixture(page,{kind:'upgrade'});await page.goto('/admin/plans?client=1');await requestSection(page).getByRole('button',{name:'Review monthly plan',exact:true}).click();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toBeFocused();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toHaveValue('150.00');await expect(page.getByLabel('Included AI credits per month',{exact:true})).toHaveValue('1000');expect(f.writes).toHaveLength(0);expect(f.data['1'].requests[0].status).toBe('pending');
});

test('failed credit approval retains payment inputs and links the same request on retry',async({page})=>{
 const f=await fixture(page,{failTopupOnce:true});await page.goto('/admin/plans?client=1');await requestSection(page).getByRole('button',{name:'Review & add credits',exact:true}).click();await payment(page);await page.getByRole('button',{name:'Review credit addition',exact:true}).click();await page.getByRole('button',{name:'Confirm paid credit addition',exact:true}).click();
 await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be confirmed');await expect(page.getByLabel('Extra AI credits',{exact:true})).toHaveValue('200');await expect(page.getByRole('combobox',{name:'Related client request',exact:true})).toHaveValue(REQUEST);expect(f.data['1'].requests[0].status).toBe('pending');await page.getByRole('button',{name:'Confirm paid credit addition',exact:true}).click();await expect(requestSection(page).getByText('0 pending',{exact:true})).toBeVisible();expect(f.writes).toHaveLength(2);expect(f.writes[0].idempotencyKey).toBe(f.writes[1].idempotencyKey);expect(f.data['1'].month.extra_credits).toBe('200');
});

for(const amount of ['150','200','300'])test(`requested 200 and granted ${amount} stay distinct in review and saved history`,async({page},info)=>{
 const f=await fixture(page);f.data['1'].requests[0].note='200 credits';await page.goto('/admin/plans?client=1');const queue=requestSection(page);
 await queue.getByRole('button',{name:'Review & add credits',exact:true}).click();await payment(page);await page.getByLabel('Extra AI credits',{exact:true}).fill(amount);await page.getByRole('button',{name:'Review credit addition',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'The linked request will close'})).toContainText(`${amount} credits added`);await expect(page.getByRole('note')).toContainText('200 credits');expect(f.writes).toHaveLength(0);
 await page.getByRole('button',{name:'Confirm paid credit addition',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'AI credits added'})).toContainText(`${amount} AI credits were added`);
 await queue.getByText('Recent resolved requests (1)',{exact:true}).click();const row=queue.getByRole('table',{name:'Recently approved or declined requests'}).getByRole('row').filter({hasText:'200 credits'});
 await expect(row.locator('td[data-label="Client message"]')).toHaveText('200 credits');await expect(row.locator('td[data-label="Client message"]')).toBeVisible();await expect(row.getByText(`${amount} credits added`,{exact:true})).toBeVisible();await expect(row.getByText('Closed',{exact:true})).toBeVisible();expect(f.data['1'].requests[0].note).toBe('200 credits');
 if(amount==='150')await queue.screenshot({path:info.outputPath('requested-200-granted-150.png')});
});

test('old closed request without a linked grant never guesses a quantity from its message',async({page})=>{
 const f=await fixture(page);Object.assign(f.data['1'].requests[0],{note:'200 credits',status:'approved',granted_credits:null,granted_period:null});await page.goto('/admin/plans?client=1');const queue=requestSection(page);await queue.getByText('Recent resolved requests (1)',{exact:true}).click();await expect(queue.getByText('Amount not recorded',{exact:true})).toBeVisible();await expect(queue.getByText('200 credits added',{exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});

test('client history shows the original message and actual grant without admin payment details',async({page})=>{
 const f=await fixture(page);Object.assign(f.data['1'].requests[0],{note:'200 credits',status:'approved',granted_credits:'150',granted_period:period});
 await page.route('**/api/credits**',r=>r.fulfill({json:{...f.data['1'],group:'day',offset:0}}));await page.goto('/?view=credits');await page.getByText('Previous requests',{exact:true}).click();const history=page.locator('#history');await expect(history.getByText('Your original message: 200 credits',{exact:true})).toBeVisible();await expect(history.getByText('150 credits added',{exact:true})).toBeVisible();await expect(history.getByText('200 credits added',{exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});
