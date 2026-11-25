import {test,expect} from '@playwright/test';
const clients=[{id:'1',name:'Alpha Client',slug:'alpha',enabled:true},{id:'2',name:'Beta Client',slug:'beta',enabled:true}];
const item=(id,title,extra={})=>({id,title,description:'Approved material',filename:title,clientId:'1',revision:'4',kind:'upload',storage:'supabase',sizeBytes:24,status:'published_link',updatedAt:'2026-11-25T00:00:00Z',url:'/api/admin/client-document-storage/'+id+'?clientId=1&revision=4',...extra});
async function fixture(page,{failOne=false,deny=false,denyHtml=false,hold=false}={}){
 const data={'1':[item('storage-one','Alpha source.js'),item('legacy-two','Alpha audit.pdf',{storage:undefined}),item('link-three','Alpha Drive guide',{kind:'document',filename:undefined,url:'https://docs.google.com/document/d/fixture/edit',storage:undefined})],'2':[item('foreign','Beta private.pdf',{clientId:'2'})]},writes=[],receipts=new Map();let failed=false,revoked=false,release;
 const held=new Promise(resolve=>release=resolve);
 await page.route('**/api/**',async route=>{
  const request=route.request(),u=new URL(request.url()),id=u.searchParams.get('clientId');
  if(request.method()==='GET'&&u.pathname==='/api/admin/client-document-assignments')return route.fulfill(revoked?{status:403,json:{error:'Fixture: administrator revoked.'}}:{json:id?{setupReady:true,uploadsReady:true,client:clients.find(c=>c.id===id),assignments:data[id],history:[]}:{clients}});
  if(request.method()==='POST'&&['/api/admin/client-document-storage','/api/admin/client-document-files','/api/admin/client-document-assignments'].includes(u.pathname)){
   const body=request.postDataJSON();writes.push({...body,route:u.pathname,clientHeader:request.headers()['x-aoc-document-client']});
   if(hold&&writes.length===1)await held;
   if(deny||denyHtml){revoked=true;return route.fulfill(denyHtml?{status:403,contentType:'text/html',body:'denied'}:{status:403,json:{error:'Fixture: administrator revoked.'}});}
   if(failOne&&body.id==='legacy-two'&&!failed){failed=true;return route.fulfill({status:500,json:{error:'Fixture: deletion failed once.'}});}
   if(!receipts.has(body.operation)){const found=data[body.clientId].find(x=>x.id===body.id);if(!found||found.revision!==body.revision)return route.fulfill({status:409,json:{error:'Fixture: stale document.'}});data[body.clientId]=data[body.clientId].filter(x=>x.id!==body.id);receipts.set(body.operation,{saved:true,id:body.id});}
   try{return await route.fulfill({json:receipts.get(body.operation)});}catch{/* A client switch may abort the already-authorized first request. */}
   return;
  }
  return route.fulfill({status:503,json:{error:'Synthetic browser fixture; no external writes.'}});
 });return {data,writes,release:()=>release()};
}
async function open(page){await page.goto('/admin/client-documents');await page.getByLabel('Client account',{exact:true}).selectOption('1');await expect(page.getByRole('heading',{name:'Add a document',exact:true})).toBeVisible();}

test('bulk delete confirms once, scopes mixed storage types and retains unselected documents',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByRole('checkbox',{name:'Select document: Alpha source.js',exact:true}).check();await page.getByRole('checkbox',{name:'Select document: Alpha Drive guide',exact:true}).check();let confirmations=0;page.once('dialog',dialog=>{confirmations++;expect(dialog.message()).toContain('2 selected documents');expect(dialog.message()).toContain('Alpha Client');return dialog.accept();});
 await page.getByRole('button',{name:'Delete selected (2)',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'2 of 2 selected documents deleted'}).last()).toBeVisible();expect(confirmations).toBe(1);expect(f.writes.map(x=>x.id)).toEqual(['storage-one','link-three']);expect(f.writes.map(x=>x.route)).toEqual(['/api/admin/client-document-storage','/api/admin/client-document-assignments']);expect(f.writes.every(x=>x.action==='archive'&&x.clientId==='1'&&x.clientHeader==='1'&&x.revision==='4')).toBe(true);expect(f.data['1'].map(x=>x.id)).toEqual(['legacy-two']);expect(f.data['2']).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('bulk-delete-result.png'),fullPage:true});
});

test('cancelling bulk delete sends nothing, and filtering clears hidden selections',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByRole('checkbox',{name:'Select all shown documents',exact:true}).check();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Delete selected (3)',exact:true}).click();expect(f.writes).toHaveLength(0);
 await page.getByLabel('Search documents',{exact:true}).fill('source');await expect(page.getByRole('button',{name:'Delete selected (0)',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:'Select all shown documents',exact:true}).check();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete selected (1)',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'1 of 1 selected documents deleted'}).last()).toBeVisible();expect(f.writes.map(x=>x.id)).toEqual(['storage-one']);expect(f.data['1']).toHaveLength(2);
});

test('failed deletions stay selected and retry only those rows with their original retry keys',async({page})=>{
 const f=await fixture(page,{failOne:true});await open(page);await page.getByRole('checkbox',{name:'Select all shown documents',exact:true}).check();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete selected (3)',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'deletion failed once'})).toBeVisible();await expect(page.getByRole('button',{name:'Delete selected (1)',exact:true})).toBeEnabled();const operation=f.writes.find(x=>x.id==='legacy-two').operation;
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete selected (1)',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'1 of 1 selected documents deleted'}).last()).toBeVisible();expect(f.writes.map(x=>x.id)).toEqual(['storage-one','legacy-two','link-three','legacy-two']);expect(f.writes.at(-1).operation).toBe(operation);expect(f.data['1']).toEqual([]);
});

for(const denyHtml of [false,true])test('revoked access stops bulk deletion and clears client data ('+(denyHtml?'HTML':'JSON')+')',async({page})=>{
 const f=await fixture(page,{deny:!denyHtml,denyHtml});await open(page);await page.getByRole('checkbox',{name:'Select all shown documents',exact:true}).check();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete selected (3)',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'administrator revoked'})).toBeVisible();expect(f.writes).toHaveLength(1);await expect(page.getByText('Alpha source.js',{exact:true})).toHaveCount(0);expect(f.data['1']).toHaveLength(3);
});

test('switching clients stops remaining deletions without changing their target',async({page})=>{
 const f=await fixture(page,{hold:true});await open(page);await page.getByRole('checkbox',{name:'Select all shown documents',exact:true}).check();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete selected (3)',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(1);await page.getByLabel('Client account',{exact:true}).selectOption('2');f.release();await expect(page.getByRole('button',{name:'Document details: Beta private.pdf',exact:true})).toBeVisible();expect(f.writes).toHaveLength(1);expect(f.writes[0].clientId).toBe('1');await expect(page.getByRole('button',{name:'Delete selected (0)',exact:true})).toBeDisabled();expect(f.data['2']).toHaveLength(1);
});


test('deleting every document shows a finished empty state and the add-file chooser still works',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByRole('checkbox',{name:'Select all shown documents',exact:true}).check();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete selected (3)',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Library is empty',exact:true})).toBeVisible();await expect(page.getByText('All selected documents have been removed.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:/^Delete selected/})).toHaveCount(0);await expect(page.getByRole('table',{name:'Documents for Alpha Client',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Refresh documents',exact:true})).toBeEnabled();expect(f.writes).toHaveLength(3);
 await page.screenshot({path:test.info().outputPath('document-library-empty.png'),fullPage:true});
 await page.getByRole('link',{name:'Add a document',exact:true}).click();await expect(page.getByRole('form',{name:'Add document',exact:true})).toBeInViewport();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles({name:'New source.js',mimeType:'text/plain',buffer:Buffer.from('// Synthetic chooser check')});await expect(page.getByLabel('Document title',{exact:true})).toHaveValue('New source.js');expect(f.writes).toHaveLength(3);
});

test('a newly empty client library explains the next action without disabled delete controls',async({page})=>{
 const f=await fixture(page);f.data['1']=[];await open(page);await expect(page.getByRole('heading',{name:'Library is empty',exact:true})).toBeVisible();await expect(page.getByText('No documents have been added for Alpha Client yet.',{exact:false})).toBeVisible();await expect(page.getByRole('link',{name:'Add a document',exact:true})).toHaveAttribute('href','#document-form-1');await expect(page.getByRole('button',{name:/^Delete selected/})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});

test('no search matches is distinct from an empty library and clear search restores its rows',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByRole('checkbox',{name:'Select all shown documents',exact:true}).check();await page.getByLabel('Search documents',{exact:true}).fill('Nothing matches this');await expect(page.getByRole('heading',{name:'No matching documents',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Library is empty',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Clear search',exact:true}).click();await expect(page.getByRole('button',{name:'Document details: Alpha source.js',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Delete selected (0)',exact:true})).toBeDisabled();expect(f.writes).toHaveLength(0);
});
