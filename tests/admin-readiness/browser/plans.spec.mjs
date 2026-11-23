import {test,expect} from '@playwright/test';
const period=new Date().toISOString().slice(0,7);
const base=id=>({ready:true,mode:'subscription',configured:false,clientId:id,period,plan:null,month:null,requests:[],runs:[],audit:[],fetchedAt:new Date().toISOString()});
async function fixture(page,{configured=false,paid=false,failSaveOnce=false,failRefresh=false,delaySave=0}={}){const data={'1':base('1'),'2':base('2')},writes=[];let refreshFailure=failRefresh;
 if(configured){data['1']={...data['1'],configured:true,plan:{monthly_price:'150.00',monthly_credits:'1000',status:'active',version:'1'},message:'This month’s AI credits are waiting for admin payment confirmation.'};if(paid)Object.assign(data['1'],{month:{monthly_price:'150.00',included_credits:'1000',extra_credits:'0',used_credits:'125'},availableCredits:'875',allocatedCredits:'1000',creditsUsed:'125',canGenerate:true,message:'AI credits are available.'});}
 await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());if(url.pathname==='/api/admin/client-plan'){
 if(route.request().method()==='GET'&&url.searchParams.has('clientId')&&refreshFailure&&writes.length)return route.fulfill({status:503,json:{error:'Fixture: plan refresh unavailable.'}});
 if(route.request().method()==='GET')return route.fulfill({json:url.searchParams.has('clientId')?data[url.searchParams.get('clientId')]:{clients:[{id:'1',name:'Alpha'},{id:'2',name:'Beta'}]}});
 const input=route.request().postDataJSON();writes.push(input);if(delaySave)await new Promise(resolve=>setTimeout(resolve,delaySave));if(failSaveOnce&&writes.length===1)return route.fulfill({status:503,json:{error:'Fixture: save could not be confirmed. Retry the same request.'}});const value=data[input.clientId];
 if(input.action==='save'){Object.assign(value,{configured:true,plan:{monthly_price:input.price,monthly_credits:input.credits,status:input.status,version:String(Number(value.plan?.version??0)+1)}});if(input.activate){value.month={monthly_price:input.price,included_credits:input.credits,extra_credits:'0',used_credits:'0'};value.availableCredits=input.credits;value.canGenerate=true;value.message='AI credits are available.';}}
 if(input.action==='topup'){value.month.extra_credits=String(Number(value.month.extra_credits)+Number(input.credits));value.availableCredits=String(Number(value.availableCredits)+Number(input.credits));}
 value.fetchedAt=new Date().toISOString();return route.fulfill({json:{ok:true}});
 }return route.fulfill({json:{ok:true}});
 });return {data,writes,recoverRefresh:()=>{refreshFailure=false;}};}
test('per-client plan uses explicit payment confirmation, review and independent fields',async({page},info)=>{
 const f=await fixture(page);await page.goto('/admin/plans?client=1');
 await expect(page.getByText('No credit-limited plan has been set for this client.')).toBeVisible();
 await page.getByLabel('Monthly portal price (USD)').fill('200');await page.getByLabel('Included AI credits per month').fill('50000');
 await page.getByLabel('Reason for this plan change').fill('Approved client package');
 await expect(page.getByLabel('Included AI credits per month')).toHaveValue('50000');
 await page.getByRole('button',{name:'Review client plan',exact:true}).click();expect(f.writes).toHaveLength(0);
 await page.getByLabel('Payment reference',{exact:true}).fill('TEST-INVOICE');
 await page.getByLabel('I verified the payment outside the portal.').check();
 await page.getByRole('button',{name:'Review client plan',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Review:'})).toContainText('50,000');
 await page.getByRole('button',{name:'Confirm client plan',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Add paid credits',exact:true})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Client plan saved'})).toContainText('50,000 AI credits are activated');
 expect(f.writes).toHaveLength(1);expect(f.writes[0].paymentConfirmed).toBe(true);expect(f.writes[0].price).toBe('200');
 await page.getByLabel('Extra AI credits').fill('1000');await page.getByLabel('Payment received (USD)').fill('5');await page.getByLabel('Payment reference',{exact:true}).fill('TEST-TOPUP');await page.getByLabel('Reason for credit addition').fill('Paid additional usage');await page.getByLabel('I verified this payment outside the portal.').check();
 await page.getByRole('button',{name:'Review credit addition'}).click();expect(f.writes).toHaveLength(1);
 await page.getByRole('button',{name:'Confirm paid credit addition'}).click();await expect(page.getByText('1,000 extra credits approved')).toBeVisible();await expect(page.getByRole('status').filter({hasText:'AI credits added'})).toContainText('1,000 AI credits were added');
 await page.screenshot({path:info.outputPath('paid-plan.png'),fullPage:true});
 await page.getByRole('combobox',{name:'Client plan',exact:true}).selectOption('2');
 // The real router destination keeps the selected client; this fixture exposes
 // the same component at /admin/plans to retain separate legacy form regressions.
 await page.goto('/admin/plans?client=2');await expect(page.getByLabel('Monthly portal price (USD)')).toHaveValue('');
 expect(f.writes.every(row=>row.clientId==='1')).toBe(true);
});
test('client plan displays actual usage and requests more credits without charging',async({page},info)=>{
 const state={...base('1'),configured:true,plan:{monthly_price:'200',monthly_credits:'50000',status:'active',version:'1'},month:{monthly_price:'200',included_credits:'50000',extra_credits:'0',used_credits:'50000'},availableCredits:'0',allocatedCredits:'50000',creditsUsed:'50000',canGenerate:false,message:'Your AI credits are used up. Request more credits or a plan upgrade.'};const writes=[];
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/api/credits')return route.fulfill({json:{...state,group:'day',offset:0}});if(url.pathname==='/api/client/plan'){const body=route.request().postDataJSON();writes.push(body);state.requests=[{id:'request',kind:body.kind,status:'pending',created_at:new Date().toISOString()}];return route.fulfill({json:{ok:true}});}return route.fulfill({json:{ok:true}});});
 await page.goto('/?view=credits');await expect(page.getByRole('heading',{name:'Plan & AI credits'})).toBeVisible({timeout:15000});
 await expect(page.getByText('Your AI credits are used up. Request more credits or a plan upgrade.',{exact:true}).first()).toBeVisible();
 await page.getByLabel('What do you need?').fill('Please quote an extra allowance');await page.getByRole('button',{name:'Request admin review'}).click();
 await expect(page.getByText('Your request is awaiting admin review.')).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0].kind).toBe('credits');expect(writes[0].paymentConfirmed).toBeUndefined();
 await page.screenshot({path:info.outputPath('client-plan.png'),fullPage:true});
 await page.goto('/?view=credits&role=client_viewer');await expect(page.getByRole('button',{name:'Request admin review'})).toHaveCount(0);
});

test('plan creation and pausing communicate different risks before saving',async({page},info)=>{
 const state=await fixture(page);await page.goto('/admin/plans?client=1');
 const form=page.getByRole('heading',{name:'Set up this client’s plan',exact:true}).locator('..');
 await expect(form.getByText('Create a client plan',{exact:true})).toBeVisible();await expect(form).toHaveAttribute('data-action-card','add');
 await expect(form).toHaveCSS('border-inline-start-color','rgb(4, 120, 87)');
 await page.getByRole('combobox',{name:'Plan status',exact:true}).selectOption('paused');
 await expect(form.getByText('Caution · Pause AI access',{exact:true})).toBeVisible();await expect(form).toHaveCSS('border-inline-start-color','rgb(146, 64, 14)');
 expect(state.writes).toHaveLength(0);await form.screenshot({path:info.outputPath('paused-plan-caution.png')});
});

async function reviewUpdate(page,{price='175',credits='1500',paid=false}={}){
 await page.getByRole('button',{name:'Edit monthly plan',exact:true}).click();
 await page.getByLabel('Monthly portal price (USD)').fill(price);await page.getByLabel('Included AI credits per month').fill(credits);
 if(!paid)await page.getByLabel('Activate '+period+' after payment confirmation').uncheck();
 await page.getByLabel('Reason for this plan change').fill('Approved synthetic plan change');await page.getByRole('button',{name:'Review client plan',exact:true}).click();
}
test('Plan update shows saving and persistent confirmation, explains unpaid activation, and clears feedback on edits',async({page},info)=>{
 const f=await fixture(page,{configured:true,delaySave:900});await page.goto('/admin/plans?client=1');await expect(page.getByRole('region',{name:'Saved monthly plan',exact:true})).toBeVisible();await reviewUpdate(page);
 await expect(page.getByRole('status').filter({hasText:'Client plan updated'})).toHaveCount(0);await page.getByRole('button',{name:'Confirm client plan',exact:true}).click();await expect(page.getByRole('button',{name:'Saving…',exact:true})).toBeDisabled();
 const success=page.getByRole('status').filter({hasText:'Client plan updated'});await expect(success).toBeVisible();await expect(success).toContainText('still waiting for admin payment confirmation');await expect(page.getByLabel('Reason for this plan change')).toHaveCount(0);await expect(success).toBeVisible();await expect(success).toBeInViewport();expect(f.writes).toHaveLength(1);
 await success.screenshot({path:info.outputPath('plan-saved-confirmation.png')});await page.getByRole('button',{name:'Edit monthly plan',exact:true}).click();await page.getByLabel('Monthly portal price (USD)').fill('180');await expect(success).toHaveCount(0);
});
test('Paid-month update confirms future settings while preserving this month’s credits; switching clients clears feedback',async({page})=>{
 const f=await fixture(page,{configured:true,paid:true});await page.goto('/admin/plans?client=1');await reviewUpdate(page,{price:'200',credits:'2000',paid:true});await page.getByRole('button',{name:'Confirm client plan',exact:true}).click();
 const success=page.getByRole('status').filter({hasText:'Client plan updated'});await expect(success).toContainText('This month’s paid credits are unchanged.');await expect(success).toContainText('future month');await expect(page.getByRole('region',{name:'Saved monthly plan'})).toContainText('2,000');await expect(page.getByLabel('Included AI credits per month')).toHaveCount(0);expect(f.data['1'].month.included_credits).toBe('1000');
 await page.goto('/admin/plans?client=2');await expect(page.getByRole('heading',{name:'Set up this client’s plan',exact:true})).toBeVisible();await expect(success).toHaveCount(0);
});
test('A failed save keeps input and retry identity and never displays a false success',async({page})=>{
 const f=await fixture(page,{configured:true,failSaveOnce:true});await page.goto('/admin/plans?client=1');await reviewUpdate(page);await page.getByRole('button',{name:'Confirm client plan',exact:true}).click();
 await expect(page.getByRole('main').getByRole('alert')).toContainText('save could not be confirmed');await expect(page.getByRole('main').getByRole('alert')).toBeInViewport();await expect(page.getByRole('status').filter({hasText:'Client plan updated'})).toHaveCount(0);await expect(page.getByLabel('Monthly portal price (USD)')).toHaveValue('175');await expect(page.getByLabel('Reason for this plan change')).toHaveValue('Approved synthetic plan change');
 await page.getByRole('button',{name:'Confirm client plan',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Client plan updated'})).toBeVisible();expect(f.writes).toHaveLength(2);expect(f.writes[0].idempotencyKey).toBe(f.writes[1].idempotencyKey);
});
test('Confirmed save survives a failed refresh and recovers without another payment or save',async({page})=>{
 const f=await fixture(page,{configured:true,failRefresh:true});await page.goto('/admin/plans?client=1');await reviewUpdate(page);await page.getByRole('button',{name:'Confirm client plan',exact:true}).click();
 await expect(page.getByRole('main').getByRole('alert')).toContainText('Your confirmed change is saved.');await expect(page.getByRole('status').filter({hasText:'Client plan updated'})).toBeVisible();expect(f.writes).toHaveLength(1);
 f.recoverRefresh();await page.getByRole('button',{name:'Refresh plan',exact:true}).click();await expect(page.getByRole('region',{name:'Saved monthly plan'})).toContainText('$175.00');await expect(page.getByRole('status').filter({hasText:'Client plan updated'})).toBeVisible();expect(f.writes).toHaveLength(1);
});


test('saved paid plan is read-only until Edit and Cancel discards all unsaved changes',async({page},info)=>{
 const f=await fixture(page,{configured:true,paid:true});await page.goto('/admin/plans?client=1');const summary=page.getByRole('region',{name:'Saved monthly plan',exact:true});
 await expect(summary).toContainText('$150.00');await expect(summary).toContainText('1,000');await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Extra AI credits',{exact:true})).toBeVisible();
 await summary.screenshot({path:info.outputPath('saved-monthly-plan.png')});await summary.getByRole('button',{name:'Edit monthly plan',exact:true}).click();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toBeFocused();
 await page.getByLabel('Monthly portal price (USD)',{exact:true}).fill('999');await page.getByLabel('Included AI credits per month',{exact:true}).fill('2500');await page.getByLabel('Reason for this plan change',{exact:true}).fill('Unsaved draft');await page.getByRole('button',{name:'Review client plan',exact:true}).click();
 await page.getByRole('button',{name:'Cancel editing',exact:true}).click();await expect(summary).toContainText('$150.00');await expect(summary).toContainText('1,000');expect(f.writes).toHaveLength(0);
 await summary.getByRole('button',{name:'Edit monthly plan',exact:true}).click();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toHaveValue('150.00');await expect(page.getByLabel('Included AI credits per month',{exact:true})).toHaveValue('1000');await expect(page.getByLabel('Reason for this plan change',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Review client plan',exact:true})).toBeVisible();expect(f.writes).toHaveLength(0);
});

test('unpaid saved plan has a clear activation action; opening or canceling never confirms payment',async({page})=>{
 const f=await fixture(page,{configured:true});await page.goto('/admin/plans?client=1');const summary=page.getByRole('region',{name:'Saved monthly plan',exact:true});await expect(summary.getByRole('button',{name:'Activate this month',exact:true})).toBeVisible();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toHaveCount(0);
 await summary.getByRole('button',{name:'Activate this month',exact:true}).click();await expect(page.getByLabel('Activate '+period+' after payment confirmation',{exact:true})).toBeChecked();await expect(page.getByLabel('I verified the payment outside the portal.',{exact:true})).not.toBeChecked();expect(f.writes).toHaveLength(0);
 await page.getByLabel('Payment reference',{exact:true}).fill('UNSAVED-PAYMENT-REFERENCE');await page.getByRole('button',{name:'Cancel editing',exact:true}).click();await expect(summary).toBeVisible();await summary.getByRole('button',{name:'Activate this month',exact:true}).click();await expect(page.getByLabel('Payment reference',{exact:true})).toHaveValue('');expect(f.writes).toHaveLength(0);expect(f.data['1'].month).toBeNull();
});

test('switching clients cannot carry an open monthly editor or its draft into the next workspace',async({page})=>{
 const f=await fixture(page,{configured:true,paid:true});await page.goto('/admin/plans?client=1');await page.getByRole('button',{name:'Edit monthly plan',exact:true}).click();await page.getByLabel('Monthly portal price (USD)',{exact:true}).fill('999');await page.getByLabel('Reason for this plan change',{exact:true}).fill('Private unsaved draft');
 await page.getByRole('combobox',{name:'Client plan',exact:true}).selectOption('2');await expect(page.getByRole('heading',{name:'Set up this client’s plan',exact:true})).toBeVisible();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toHaveValue('');await expect(page.getByLabel('Reason for this plan change',{exact:true})).toHaveValue('');
 await page.getByRole('combobox',{name:'Client plan',exact:true}).selectOption('1');await expect(page.getByRole('region',{name:'Saved monthly plan',exact:true})).toBeVisible();await expect(page.getByLabel('Monthly portal price (USD)',{exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});
