import {test,expect} from '@playwright/test';
const clients=[{id:'1',name:'Alpha Client',slug:'alpha',enabled:true},{id:'2',name:'Beta Client',slug:'beta',enabled:true}];
async function fixture(page,{ready=true,failOnce=false}={}){
 const data={'1':[],'2':[]},writes=[];
 await page.route('**/api/**',async route=>{const request=route.request(),u=new URL(request.url()),client=u.searchParams.get('clientId');
  if(u.pathname==='/api/admin/client-document-assignments'&&request.method()==='GET')return route.fulfill({json:client?{setupReady:true,uploadsReady:ready,client:clients.find(item=>item.id===client),assignments:data[client],history:[]}:{clients}});
  if(u.pathname==='/api/admin/client-document-files'){
   const form=await new Response(request.postDataBuffer(),{headers:{'Content-Type':request.headers()['content-type']}}).formData(),file=form.get('file');
   const input=Object.fromEntries([...form.entries()].filter(([key])=>key!=='file'));input.filename=file.name;input.size=file.size;writes.push(input);
   if(failOnce&&writes.length===1)return route.fulfill({status:503,json:{error:'Fixture: upload unavailable. Try again.'}});
   const item={id:'uploaded-'+writes.length,clientId:input.clientId,title:input.title,description:input.description,filename:file.name,sizeBytes:file.size,kind:'upload',mimeType:'application/pdf',url:'/api/admin/client-document-files/private-id?clientId='+input.clientId+'&revision=1',revision:'1',updatedAt:'2026-11-23T00:00:00Z',status:input.share==='true'?'published_link':'saved_not_published'};data[input.clientId].push(item);
   return route.fulfill({json:{saved:true,id:item.id,revision:'1',status:item.status}});
  }
  return route.fulfill({status:503,json:{error:'Mocked UI fixture; no database or provider request.'}});
 });return {data,writes};
}
async function open(page){await page.goto('/admin/client-documents');await page.getByLabel('Client account',{exact:true}).selectOption('1');await expect(page.getByRole('heading',{name:'Add a document',exact:true})).toBeVisible();}
const file={name:'Approved audit.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nSynthetic browser document')};
test('file selection fills the title and one save shares a stored upload without a Google link',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles(file);await expect(page.getByLabel('Document title',{exact:true})).toHaveValue(file.name);await expect(page.getByLabel('Or paste a Google Drive link',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Document saved and shared'})).toBeVisible();expect(f.writes).toHaveLength(1);expect(f.writes[0].share).toBe('true');expect(f.writes[0].description).toBe('');
 const row=page.getByRole('row').filter({has:page.getByRole('button',{name:'Document details: '+file.name,exact:true})});await expect(row.getByRole('link',{name:'View / download',exact:true})).toHaveAttribute('href',/\/api\/admin\/client-document-files\/private-id/);await expect(row.getByRole('button',{name:'Unshare',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Edit',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Delete',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('simple-upload-library.png'),fullPage:true});
});
test('drag and drop works and the optional share checkbox saves a private draft',async({page})=>{
 const f=await fixture(page);await open(page);const transfer=await page.evaluateHandle(()=>{const dt=new DataTransfer();dt.items.add(new File(['%PDF-1.7\nDrop fixture'],'Dropped report.pdf',{type:'application/pdf'}));return dt;});
 await page.getByText('Drop a file here',{exact:true}).locator('..').dispatchEvent('drop',{dataTransfer:transfer});await expect(page.getByLabel('Document title',{exact:true})).toHaveValue('Dropped report.pdf');await page.getByRole('checkbox',{name:/Share with Alpha Client/}).uncheck();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Private draft',{exact:true})).toBeVisible();expect(f.writes[0].share).toBe('false');await transfer.dispose();
});
test('failed upload keeps the selected file and reuses its retry operation',async({page})=>{
 const f=await fixture(page,{failOnce:true});await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles(file);await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Fixture: upload unavailable'})).toContainText('Fixture: upload unavailable');await expect(page.getByLabel('Document title',{exact:true})).toHaveValue(file.name);
 await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Document saved and shared'})).toBeVisible();expect(f.writes[0].operation).toBe(f.writes[1].operation);expect(f.data['1']).toHaveLength(1);
});
test('unsupported files and missing storage setup do not send upload requests',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles({name:'Blocked.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ')});await expect(page.getByRole('alert').filter({hasText:'not supported'})).toContainText('not supported');expect(f.writes).toHaveLength(0);
 await page.unroute('**/api/**');await fixture(page,{ready:false});await open(page);await expect(page.getByRole('button',{name:'Choose files',exact:true})).toBeDisabled();await expect(page.getByLabel('Or paste a Google Drive link',{exact:true})).toBeEnabled();
});
test('client switching clears the selected file and search/sorting use stored sizes',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles(file);await page.getByRole('checkbox',{name:/Share with Alpha Client/}).uncheck();await page.getByLabel('Client account',{exact:true}).selectOption('2');await expect(page.getByLabel('Attach a document',{exact:true})).toHaveJSProperty('value','');await expect(page.getByRole('button',{name:'Remove file',exact:true})).toHaveCount(0);
 f.data['1']=[{id:'large',title:'Zebra.pdf',filename:'Zebra.pdf',sizeBytes:100,kind:'upload',updatedAt:'2026-11-23T00:00:00Z',status:'published_link',url:'/api/admin/client-document-files/large',revision:'1'},{id:'small',title:'Alpha.pdf',filename:'Alpha.pdf',description:'Earlier audit',sizeBytes:20,kind:'upload',updatedAt:'2026-11-20T00:00:00Z',status:'published_link',url:'/api/admin/client-document-files/small',revision:'1'}];
 await page.getByLabel('Client account',{exact:true}).selectOption('1');await expect(page.getByRole('checkbox',{name:/Share with Alpha Client/})).not.toBeChecked();await page.getByLabel('Sort documents',{exact:true}).selectOption('size-asc');await expect(page.getByRole('button',{name:/^Document details:/})).toHaveText(['Alpha.pdf','Zebra.pdf']);await page.getByLabel('Search documents',{exact:true}).fill('Earlier');await expect(page.getByRole('button',{name:/^Document details:/})).toHaveText(['Alpha.pdf']);
});
