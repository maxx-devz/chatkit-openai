import {test,expect} from '@playwright/test';

const clients=[{id:'1',name:'Alpha Client',slug:'alpha',enabled:true},{id:'2',name:'Beta Client',slug:'beta',enabled:true}];
const reference=id=>({id:'reference-'+id,clientId:id,title:id==='1'?'Alpha audit':'Beta audit',url:'https://drive.google.com/file/d/approved'+id+'/view',kind:'file',stage:2,revision:'1',updatedAt:'2026-11-20T00:00:00Z'});
async function fixture(page,{withReference=false}={}) {
  const reads=[],writes=[],data=Object.fromEntries(clients.map(client=>[client.id,{setupReady:true,client,assignments:withReference?[reference(client.id)]:[],history:[]}]));
  let failRefresh=false,failureStatus=503,holdRefresh=null;
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/api/admin/client-document-assignments') {
      const id=url.searchParams.get('clientId');
      if(request.method()==='GET') {
        reads.push(id||'clients');
        if(!id)return route.fulfill({json:{clients}});
        // Snapshot before holding so overlap tests can return deliberately old data.
        const snapshot=structuredClone(data[id]);
        const held=holdRefresh;if(held?.once)holdRefresh=null;if(held)await held.promise;
        if(failRefresh)return route.fulfill({status:failureStatus,json:{error:'Fixture: reference refresh unavailable.'}});
        return route.fulfill({json:snapshot});
      }
      const input=request.postDataJSON();writes.push(input);
      if(input.action==='save')data[input.clientId].assignments=[{...reference(input.clientId),title:input.title,url:input.url,stage:input.stage,revision:String(writes.length+1)}];
      return route.fulfill({json:{ok:true}});
    }
    if(url.pathname==='/api/admin/client-documents')return route.fulfill({json:{setupReady:true,connection:{configured:false,connected:false,message:'Fixture: Google is not connected.'},journey:{revision:'1',currentStage:2,nextAction:'Review the audit'},releases:[],history:[]}});
    return route.fulfill({status:503,json:{error:'Isolated fixture; no external requests permitted.'}});
  });
  return {reads,writes,data,setFailure:(value,status=503)=>{failRefresh=value;failureStatus=status;},hold:({once=false}={})=>{let release;const held={promise:new Promise(resolve=>{release=resolve;}),once};holdRefresh=held;return ()=>{if(holdRefresh===held)holdRefresh=null;release();};}};
}
async function open(page,id='1') {
  await page.goto('/admin/client-documents');
  await page.getByLabel('Client account',{exact:true}).selectOption(id);
  await expect(page.getByRole('heading',{name:'Add document',exact:true})).toBeVisible();

}

test('focus and native client dropdown interactions do not reload references or remove drafts',async({page})=>{
  const f=await fixture(page);await open(page);
  const title=page.getByLabel('Document title',{exact:true});await title.fill('Unsaved reference');
  await page.getByLabel('Client account',{exact:true}).focus();
  // Native select popups and browser-tab returns dispatch the window event.
  await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});
  await page.waitForTimeout(250);
  expect(f.reads.filter(id=>id==='1')).toHaveLength(1);
  await expect(title).toHaveValue('Unsaved reference');
  await expect(page.getByText('Loading saved references…',{exact:true})).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
});

test('tab focus preserves unsaved document descriptions and an open reference edit',async({page})=>{
  const f=await fixture(page,{withReference:true});await open(page);
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Document title',{exact:true}).fill('Unsubmitted edit');
  
  const action=page.getByLabel('Description',{exact:true});await action.fill('Unsaved description');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(250);
  await expect(action).toHaveValue('Unsaved description');
  await expect(page.getByLabel('Document title',{exact:true})).toHaveValue('Unsubmitted edit');
  await expect(page.getByRole('heading',{name:'Edit document',exact:true})).toBeVisible();
  expect(f.writes).toHaveLength(0);
});

test('explicit refresh keeps forms visible and retains drafts on success and failure',async({page})=>{
  const f=await fixture(page,{withReference:true});await open(page);
  const title=page.getByLabel('Document title',{exact:true});await title.fill('Keep this draft');
  
  const action=page.getByLabel('Description',{exact:true});await action.fill('Keep this description');
  const release=f.hold();await page.getByRole('button',{name:'Refresh references',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refreshing references…',exact:true})).toBeDisabled();
  await expect(title).toBeVisible();await expect(title).toHaveValue('Keep this draft');
  await expect(action).toHaveValue('Keep this description');release();
  await expect(page.getByRole('button',{name:'Refresh references',exact:true})).toBeEnabled();
  await expect(title).toHaveValue('Keep this draft');await expect(action).toHaveValue('Keep this description');
  f.setFailure(true);await page.getByRole('button',{name:'Refresh references',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Fixture:'})).toContainText('Fixture: reference refresh unavailable.');
  await expect(page.getByRole('alert').filter({hasText:'Fixture:'})).toContainText('may be out of date');
  await expect(title).toHaveValue('Keep this draft');await expect(action).toHaveValue('Keep this description');
  f.setFailure(false);await page.getByRole('button',{name:'Refresh references',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Fixture:'})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});

test('saving refreshes references without another loading-screen replacement or duplicate write',async({page})=>{
  const f=await fixture(page);await open(page);
  await page.getByLabel('Document title',{exact:true}).fill('Approved fixture audit');
  await page.getByLabel('Google Drive file link',{exact:true}).fill('https://drive.google.com/file/d/approved1/view');
  
  const release=f.hold();await page.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Reference saved.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Add document',exact:true})).toBeVisible();
  await expect(page.getByText('Loading saved references…',{exact:true})).toHaveCount(0);
  release();await expect(page.getByText('Approved fixture audit',{exact:true})).toBeVisible();
  expect(f.writes).toHaveLength(1);expect(f.writes[0].clientId).toBe('1');
});

test('switching clients discards prior client content and a late response cannot restore it',async({page})=>{
  const f=await fixture(page,{withReference:true});await open(page);
  await expect(page.getByText('Alpha audit',{exact:true})).toBeVisible();
  const release=f.hold();await page.getByRole('button',{name:'Refresh references',exact:true}).click();
  await page.getByLabel('Client account',{exact:true}).selectOption('2');
  await expect(page.getByText('Alpha audit',{exact:true})).toHaveCount(0);release();
  await expect(page.getByText('Beta audit',{exact:true})).toBeVisible();
  await expect(page.getByText('Alpha audit',{exact:true})).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('a late pre-save response cannot overwrite the saved reference',async({page})=>{
  const f=await fixture(page,{withReference:true});await open(page);
  const release=f.hold({once:true});await page.getByRole('button',{name:'Refresh references',exact:true}).click();
  await expect.poll(()=>f.reads.filter(id=>id==='1').length).toBe(2);
  await page.getByLabel('Document title',{exact:true}).fill('Newly saved audit');
  await page.getByLabel('Google Drive file link',{exact:true}).fill('https://drive.google.com/file/d/approved1/view');
  
  await page.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(page.getByText('Newly saved audit',{exact:true})).toBeVisible();release();
  await page.waitForTimeout(200);await expect(page.getByText('Newly saved audit',{exact:true})).toBeVisible();
  await expect(page.getByText('Alpha audit',{exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(1);
});

test('refresh authorization denial clears previously displayed client content',async({page})=>{
  const f=await fixture(page,{withReference:true});await open(page);
  await expect(page.getByText('Alpha audit',{exact:true})).toBeVisible();
  f.setFailure(true,403);await page.getByRole('button',{name:'Refresh references',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Fixture:'})).toBeVisible();
  await expect(page.getByText('Alpha audit',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Document title',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Google Drive document delivery',exact:true})).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
});
