import {test,expect} from '@playwright/test';
const clients=[{id:'1',name:'Alpha Client',slug:'alpha',enabled:true},{id:'2',name:'Beta Client',slug:'beta',enabled:true}];
const pdf=name=>({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nSynthetic bulk upload')});
async function fixture(page,{failSecond=false,ambiguousFirst=false,holdFirst=false,deny=false,denyHtml=false}={}){
 const data={'1':[],'2':[]},writes=[],receipts=new Map();let active=0,maxActive=0,release,revoked=false,failed=false;
 const held=new Promise(resolve=>release=resolve);
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),id=url.searchParams.get('clientId');
  if(url.pathname==='/api/admin/client-document-assignments'&&req.method()==='GET'){
   if(revoked&&id)return route.fulfill({status:403,json:{error:'Fixture: access revoked.'}});
   return route.fulfill({json:id?{setupReady:true,uploadsReady:true,client:clients.find(c=>c.id===id),assignments:data[id],history:[]}:{clients}});
  }
  if(url.pathname==='/api/admin/client-document-files'){
   const form=await new Response(req.postDataBuffer(),{headers:{'Content-Type':req.headers()['content-type']}}).formData(),file=form.get('file');
   const body=Object.fromEntries([...form.entries()].filter(([key])=>key!=='file'));body.filename=file.name;body.header=req.headers()['x-aoc-document-client'];writes.push(body);active++;maxActive=Math.max(active,maxActive);
   try{
    if(holdFirst&&writes.length===1)await held;
    if(deny||denyHtml){revoked=true;return await route.fulfill(denyHtml?{status:403,contentType:'text/html',body:'<p>Access denied</p>'}:{status:403,json:{error:'Fixture: access revoked.'}});}
    if(failSecond&&file.name==='Two.pdf'&&!failed){failed=true;return await route.fulfill({status:500,json:{error:'Fixture: second file failed.'}});}
    let result=receipts.get(body.operation);
    if(!result){const item={id:'upload-'+receipts.size,kind:'upload',title:body.title,description:body.description,filename:file.name,clientId:body.clientId,sizeBytes:file.size,url:'/api/admin/client-document-files/fixture?clientId='+body.clientId,revision:'1',status:body.share==='true'?'published_link':'saved_not_published',updatedAt:'2026-11-23T00:00:00Z'};data[body.clientId].push(item);result={saved:true,id:item.id,status:item.status};receipts.set(body.operation,result);}
    return await route.fulfill({json:ambiguousFirst&&writes.length===1?{}:result});
   }finally{active--;}
  }
  return route.fulfill({status:503,json:{error:'Synthetic UI fixture; no database or provider call.'}});
 });
 return {data,writes,receipts,release:()=>release(),maxActive:()=>maxActive};
}
async function open(page){await page.goto('/admin/client-documents');await page.getByLabel('Client account',{exact:true}).selectOption('1');await expect(page.getByRole('heading',{name:'Add a document',exact:true})).toBeVisible();}
async function queue(page,files=[pdf('One.pdf'),pdf('Two.pdf'),pdf('Three.pdf')]){await page.getByLabel('Attach a document',{exact:true}).setInputFiles(files);await expect(page.getByRole('region',{name:'Bulk document upload',exact:true})).toBeVisible();}
test('multiple selection saves individually with titles, client binding and one active request',async({page})=>{
 const f=await fixture(page);await open(page);await queue(page);await page.getByLabel('Title for Two.pdf',{exact:true}).fill('Approved second audit');await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'3 of 3 files saved'}).last()).toBeVisible();
 expect(f.writes).toHaveLength(3);expect(f.maxActive()).toBe(1);expect(f.writes.map(x=>x.clientId)).toEqual(['1','1','1']);expect(f.writes.every(x=>x.header===x.clientId&&x.share==='true')).toBe(true);expect(f.writes[1].title).toBe('Approved second audit');expect(f.data['1']).toHaveLength(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('bulk-upload-results.png'),fullPage:true});
});
test('multiple dropped files can be saved privately with no automatic sharing',async({page})=>{
 const f=await fixture(page);await open(page);const transfer=await page.evaluateHandle(()=>{const d=new DataTransfer();for(const n of ['Drop one.pdf','Drop two.pdf'])d.items.add(new File(['%PDF-1.7\nSynthetic'],n,{type:'application/pdf'}));return d;});await page.getByText('Drop a file here',{exact:true}).locator('..').dispatchEvent('drop',{dataTransfer:transfer});await page.getByRole('checkbox',{name:/Share with Alpha Client/}).uncheck();await page.getByRole('button',{name:'Upload private drafts',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'2 of 2 files saved'}).last()).toBeVisible();expect(f.writes.every(x=>x.share==='false')).toBe(true);await transfer.dispose();
});
test('invalid files remain visible while valid siblings can still upload',async({page})=>{
 const f=await fixture(page);await open(page);await queue(page,[pdf('Good.pdf'),{name:'Unsafe.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ')},{name:'Empty.txt',mimeType:'text/plain',buffer:Buffer.alloc(0)},{name:'Unknown.blob',mimeType:'application/octet-stream',buffer:Buffer.from('unknown')}]);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'1 of 4 files saved'}).last()).toBeVisible();expect(f.writes.map(x=>x.filename)).toEqual(['Good.pdf']);await expect(page.getByText(/This extension is not supported/).first()).toBeVisible();
});
test('retry sends only failed files with the original operation and locked details',async({page})=>{
 const f=await fixture(page,{failSecond:true});await open(page);await queue(page);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'2 of 3 files saved'}).last()).toBeVisible();await expect(page.getByLabel('Title for Two.pdf',{exact:true})).toBeDisabled();const original=f.writes.find(x=>x.filename==='Two.pdf').operation;
 await page.getByRole('button',{name:/^Retry selected files/}).click();await expect(page.getByRole('status').filter({hasText:'3 of 3 files saved'}).last()).toBeVisible();expect(f.writes).toHaveLength(4);expect(f.writes[3].filename).toBe('Two.pdf');expect(f.writes[3].operation).toBe(original);expect(f.data['1']).toHaveLength(3);
});
test('an unconfirmed response can be retried without duplicating a saved file',async({page})=>{
 const f=await fixture(page,{ambiguousFirst:true});await open(page);await queue(page,[pdf('One.pdf'),pdf('Two.pdf')]);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByText('Not confirmed',{exact:true})).toBeVisible();await page.getByRole('button',{name:/^Retry selected files/}).click();await expect(page.getByRole('status').filter({hasText:'2 of 2 files saved'}).last()).toBeVisible();expect(f.writes[0].operation).toBe(f.writes[2].operation);expect(f.data['1']).toHaveLength(2);
});
test('stop waits for the current upload and continue sends only remaining files',async({page})=>{
 const f=await fixture(page,{holdFirst:true});await open(page);await queue(page);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(1);await page.getByRole('button',{name:'Stop after current file',exact:true}).click();f.release();await expect(page.getByRole('status').filter({hasText:'Queue stopped.'}).last()).toBeVisible();expect(f.writes).toHaveLength(1);
 await page.getByRole('button',{name:/^Retry selected files/}).click();await expect(page.getByRole('status').filter({hasText:'3 of 3 files saved'}).last()).toBeVisible();expect(f.writes).toHaveLength(3);
});
test('switching clients discards the queue and does not start its remaining requests',async({page})=>{
 const f=await fixture(page,{holdFirst:true});await open(page);await queue(page);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(1);await page.getByLabel('Client account',{exact:true}).selectOption('2');await expect(page.getByRole('region',{name:'Bulk document upload',exact:true})).toHaveCount(0);await expect(page.getByLabel('Attach a document',{exact:true})).toHaveValue('');f.release();await expect(page.getByRole('checkbox',{name:/Share with Beta Client/})).toBeVisible();expect(f.writes).toHaveLength(1);expect(f.writes[0].clientId).toBe('1');expect(f.data['2']).toEqual([]);
});
test('revoked admin access stops the queue and clears the document form',async({page})=>{
 const f=await fixture(page,{deny:true});await open(page);await queue(page);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Fixture: access revoked.'})).toBeVisible();await expect(page.getByRole('region',{name:'Bulk document upload',exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(1);
});
test('selection cap, queue removal and added files do not silently discard selections',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles(Array.from({length:21},(_,i)=>pdf('Report '+i+'.pdf')));await expect(page.getByRole('alert').filter({hasText:'up to 20 files'})).toBeVisible();expect(f.writes).toHaveLength(0);
 await queue(page,[pdf('One.pdf'),pdf('Two.pdf')]);await page.getByRole('button',{name:'Remove One.pdf',exact:true}).click();await page.getByLabel('Add files to upload queue',{exact:true}).setInputFiles([pdf('Three.pdf')]);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'2 of 2 files saved'}).last()).toBeVisible();expect(f.writes.map(x=>x.filename)).toEqual(['Two.pdf','Three.pdf']);
});

test('a non-JSON authorization failure also stops remaining files and clears stale content',async({page})=>{
 const f=await fixture(page,{denyHtml:true});await open(page);await queue(page);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Fixture: access revoked.'})).toBeVisible();await expect(page.getByRole('region',{name:'Bulk document upload',exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(1);
});


test('checkbox retries send only selected failures and never resend saved rows',async({page})=>{
 const f=await fixture(page);await open(page);let failures=0;
 await page.route('**/api/admin/client-document-files',async route=>{if(failures<2){failures++;return route.fulfill({status:500,json:{error:'Selected-retry fixture failure.'}});}return route.fallback();});
 await queue(page);await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'1 of 3 files saved'}).last()).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'Select upload: Three.pdf',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Select upload: Two.pdf',exact:true}).uncheck();await page.getByRole('button',{name:'Retry selected files (1)',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'2 of 3 files saved'}).last()).toBeVisible();expect(f.writes.map(x=>x.filename)).toEqual(['Three.pdf','One.pdf']);
 await page.getByRole('button',{name:'Retry Two.pdf',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'3 of 3 files saved'}).last()).toBeVisible();expect(f.writes.map(x=>x.filename)).toEqual(['Three.pdf','One.pdf','Two.pdf']);expect(f.data['1']).toHaveLength(3);
});

test('pending upload selection can be cleared without sending a request',async({page})=>{
 const f=await fixture(page);await open(page);await queue(page);await page.getByRole('checkbox',{name:'Select all pending uploads',exact:true}).uncheck();await expect(page.getByRole('button',{name:'Upload & share files',exact:true})).toBeDisabled();expect(f.writes).toHaveLength(0);
 await page.getByRole('checkbox',{name:'Select upload: Two.pdf',exact:true}).check();await page.getByRole('button',{name:'Upload & share files',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'1 of 3 files saved'}).last()).toBeVisible();expect(f.writes.map(x=>x.filename)).toEqual(['Two.pdf']);
});
