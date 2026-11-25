import {test,expect} from '@playwright/test';
const clients=[{id:'1',name:'Alpha Client',slug:'alpha',enabled:true},{id:'2',name:'Beta Client',slug:'beta',enabled:true}];
async function fixture(page,{pause=false,missing=false,stored=false}={}){
 const provider='https://fixture.supabase.co',endpoint='https://fixture.storage.supabase.co/storage/v1/upload/resumable/sign',tickets=new Map(),data={'1':[],'2':[]},writes=[],patches=[];let offset=0,failed=false,puts=0,heads=0;
 const cors={'Access-Control-Allow-Origin':'http://127.0.0.1:3115','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'PUT,POST,PATCH,HEAD,OPTIONS','Access-Control-Expose-Headers':'Location,Upload-Offset,Tus-Resumable'};
 await page.route('**/storage/v1/**',async route=>{const request=route.request(),method=request.method();expect(request.headers().apikey).toBeUndefined();expect(request.headers().authorization).toBeUndefined();if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
  if(method==='PUT'){puts++;return route.fulfill({status:200,headers:cors,json:{Key:'fixture'}});}
  if(method==='POST')return route.fulfill({status:201,headers:{...cors,Location:endpoint+'/fixture'}});
  if(method==='HEAD'){heads++;return route.fulfill({status:200,headers:{...cors,'Upload-Offset':String(offset)}});}
  if(method==='PATCH'){const size=request.postDataBuffer().length;patches.push(size);if(pause&&offset>0&&!failed){failed=true;return route.fulfill({status:503,headers:cors});}offset+=size;return route.fulfill({status:204,headers:{...cors,'Upload-Offset':String(offset)}});}
  return route.fulfill({status:404,headers:cors});
 });
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url()),client=url.searchParams.get('clientId');
  if(url.pathname==='/api/admin/client-document-assignments'&&request.method()==='GET')return route.fulfill({json:client?{setupReady:true,uploadsReady:true,directUploadsReady:!missing,client:clients.find(c=>c.id===client),assignments:data[client],history:[]}:{clients}});
  if(url.pathname==='/api/admin/client-document-storage'){
   const body=request.postDataJSON();writes.push(body);if(missing)return route.fulfill({status:503,json:{error:'Private Storage needs server setup.'}});
   if(body.action==='prepare'){let ticket=tickets.get(body.operation);if(!ticket){const id=crypto.randomUUID(),path='clients/'+body.clientId+'/'+id+'/document.js';ticket={body,id,upload:{origin:provider,endpoint,bucket:'private-fixture',path,token:'fixture-token',signedUrl:provider+'/storage/v1/object/upload/sign/private-fixture/'+path+'?token=fixture-token'}};tickets.set(body.operation,ticket);}return route.fulfill({json:{prepared:true,id:ticket.id,upload:stored?{stored:true}:ticket.upload}});}
   const ticket=tickets.get(body.operation),item={id:ticket.id,clientId:body.clientId,title:ticket.body.title,filename:ticket.body.filename,sizeBytes:ticket.body.size,revision:'1',kind:'upload',storage:'supabase',status:ticket.body.share?'published_link':'saved_not_published',updatedAt:'2026-11-23T00:00:00Z',url:'/api/admin/client-document-storage/'+ticket.id+'?clientId='+body.clientId+'&revision=1'};data[body.clientId].push(item);return route.fulfill({json:{saved:true,id:item.id,status:item.status}});
  }
  return route.fulfill({status:503,json:{error:'Isolated synthetic browser fixture only.'}});
 });return {data,writes,patches,puts:()=>puts,heads:()=>heads};
}
async function open(page){await page.goto('/admin/client-documents');await page.getByLabel('Client account',{exact:true}).selectOption('1');await expect(page.getByRole('heading',{name:'Add a document',exact:true})).toBeVisible();}
const file=mb=>({name:'source.js',mimeType:'text/javascript',buffer:Buffer.alloc(mb*1024*1024,120)});
test('a large programming file uses direct Storage and appears in the library after verification',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles(file(3));await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Document saved and shared'})).toBeVisible();expect(f.puts()).toBe(1);expect(f.writes.map(x=>x.action)).toEqual(['prepare','complete']);expect(f.data['1']).toHaveLength(1);expect(f.writes[0].size).toBe(3*1024*1024);await expect(page.getByRole('link',{name:'View / download',exact:true})).toHaveAttribute('href',/client-document-storage/);await page.screenshot({path:test.info().outputPath('large-private-upload.png'),fullPage:true});
});
test('large resumable transfer retries from its saved chunk and never prematurely completes',async({page})=>{
 const f=await fixture(page,{pause:true});await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles(file(7));await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'transfer paused'})).toBeVisible();expect(f.writes.filter(x=>x.action==='complete')).toHaveLength(0);await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Document saved and shared'})).toBeVisible();expect(f.heads()).toBe(1);expect(f.patches).toEqual([6*1024*1024,1024*1024,1024*1024]);expect(f.writes[0].operation).toBe(f.writes[1].operation);expect(f.data['1']).toHaveLength(1);
});
test('missing private Storage setup explains the failure and preserves the large file for retry',async({page})=>{
 const f=await fixture(page,{missing:true});await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles(file(3));await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'needs server setup'})).toBeVisible();await expect(page.getByLabel('Document title',{exact:true})).toHaveValue('source.js');expect(f.puts()).toBe(0);expect(f.data['1']).toHaveLength(0);
});


test('an image already transferred can finish validation without another browser upload',async({page})=>{
 const f=await fixture(page,{stored:true});await open(page);await page.getByLabel('Attach a document',{exact:true}).setInputFiles({name:'photo.jpeg',mimeType:'image/jpeg',buffer:Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 synthetic')});await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Document saved and shared'})).toBeVisible();expect(f.puts()).toBe(0);expect(f.patches).toEqual([]);expect(f.writes.map(x=>x.action)).toEqual(['prepare','complete']);expect(f.writes[0].operation).toBe(f.writes[1].operation);expect(f.data['1']).toHaveLength(1);
});
