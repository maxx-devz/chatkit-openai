import {test,expect} from '@playwright/test';
const clients=[{id:'1',name:'Alpha Client',slug:'alpha',enabled:true},{id:'2',name:'Beta Client',slug:'beta',enabled:true}];
const driveUrl='https://docs.google.com/document/d/ApprovedFixture12345/edit';
async function fixture(page,{folder=false,failOnce=false}={}){
 const item={id:'fixture-report',clientId:'1',title:'Approved fixture report',description:'Website review findings and recommended next steps.',url:driveUrl,kind:folder?'folder':'document',revision:'1',status:'saved_not_published',updatedAt:'2026-11-23T00:00:00Z'},writes=[];let removed=false;
 await page.route('**/api/**',async route=>{const request=route.request(),u=new URL(request.url()),id=u.searchParams.get('clientId');
  if(u.pathname==='/api/admin/client-document-assignments'){
   if(request.method()==='GET')return route.fulfill({json:id?{setupReady:true,uploadsReady:true,client:clients.find(c=>c.id===id),assignments:id==='1'&&!removed?[item]:[],history:[]}:{clients}});
   const body=request.postDataJSON();writes.push(body);
   if(failOnce&&body.action==='publish'&&writes.filter(w=>w.action==='publish').length===1)return route.fulfill({status:503,json:{error:'Fixture: sharing could not be confirmed. Retry.'}});
   item.revision=String(Number(item.revision)+1);item.status=['publish','save_publish'].includes(body.action)?'published_link':'saved_not_published';
   if(['save','save_publish'].includes(body.action)){item.title=body.title;item.description=body.description;item.url=body.url;}
   if(body.action==='archive')removed=true;
   return route.fulfill({json:{saved:true,id:item.id,revision:item.revision,status:item.status}});
  }
  if(u.pathname==='/api/client-documents')return route.fulfill({json:{items:id==='1'&&!removed&&item.status==='published_link'?[{...item,delivery:'link',canView:true,viewLabel:'Open in Google Docs',publishedAt:item.updatedAt,viewUrl:'/api/client-documents/'+item.id+'?clientId=1&source=link&revision='+item.revision,downloadUrl:null}]:[],hasMore:false}});
  return route.fulfill({status:503,json:{error:'Isolated fixture; no database or Google access.'}});
 });return {item,writes};
}
async function open(page,id='1'){await page.goto('/admin/client-documents');await page.getByLabel('Client account',{exact:true}).selectOption(id);await expect(page.getByRole('heading',{name:'Add a document',exact:true})).toBeVisible();}
test('one-step link save and share needs only a client, title and link',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByLabel('Document title',{exact:true}).fill('Updated approved report');await page.getByLabel('Or paste a Google Drive link',{exact:true}).fill(driveUrl);
 await page.getByRole('button',{name:'Save & share',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Document saved and shared'})).toBeVisible();
 expect(f.writes).toHaveLength(1);expect(f.writes[0].action).toBe('save_publish');expect(f.writes[0].confirmed).toBe(true);expect(f.writes[0].description).toBe('');
 await page.goto('/document-library?client=1');await expect(page.getByText('Updated approved report',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Open in Google Docs'})).toHaveAttribute('href',/source=link/);
 await page.goto('/document-library?client=2');await expect(page.getByText('Updated approved report',{exact:true})).toHaveCount(0);
});
test('row actions are immediately available; sharing, unsharing and editing keep explicit visibility',async({page})=>{
 const f=await fixture(page);await open(page);await expect(page.getByRole('button',{name:'Edit',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Delete',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Share',exact:true}).click();await expect(page.getByRole('button',{name:'Unshare',exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Unshare',exact:true}).click();await expect(page.getByText('Private draft',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Document title',{exact:true}).fill('Edited report');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByText('Edited report',{exact:true})).toBeVisible();expect(f.writes.at(-1).action).toBe('save');
});
test('draft checkbox and private folders do not grant client access',async({page})=>{
 const f=await fixture(page);await open(page);await page.getByLabel('Document title',{exact:true}).fill('Private review');await page.getByLabel('Or paste a Google Drive link',{exact:true}).fill(driveUrl);await page.getByRole('checkbox',{name:/Share with Alpha Client/}).uncheck();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();expect(f.writes[0].action).toBe('save');await page.goto('/document-library?client=1');await expect(page.getByText('Private review',{exact:true})).toHaveCount(0);
 await page.unroute('**/api/**');await fixture(page,{folder:true});await open(page);await expect(page.getByRole('button',{name:'Share',exact:true})).toHaveCount(0);
});
test('failed sharing preserves the document and reuses the retry key',async({page})=>{
 const f=await fixture(page,{failOnce:true});await open(page);await page.getByRole('button',{name:'Share',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Fixture: sharing'})).toContainText('Fixture: sharing');
 await page.getByRole('button',{name:'Share',exact:true}).click();await expect(page.getByRole('button',{name:'Unshare',exact:true})).toBeVisible();expect(f.writes).toHaveLength(2);expect(f.writes[0].operation).toBe(f.writes[1].operation);
});
test('delete needs confirmation and no typed reason; cancellation sends no request',async({page})=>{
 const f=await fixture(page);await open(page);page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Delete',exact:true}).click();expect(f.writes).toHaveLength(0);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByText('Approved fixture report',{exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(1);expect(f.writes[0].action).toBe('archive');expect(f.writes[0].reason).toBeTruthy();
});
test('description is optional, can be edited, and has no journey controls',async({page})=>{
 await fixture(page);await open(page);await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Description (optional)',{exact:true}).fill('Approved findings and priorities');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('button',{name:'Share',exact:true}).click();await page.goto('/document-library?client=1');await expect(page.getByText('Approved findings and priorities',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Your journey',exact:true})).toHaveCount(0);
});
test('document open actions retain the known file types and authorized URLs',async({page})=>{
 const types=[['Audit.PDF','View PDF'],['Costs.xlsx','Open spreadsheet'],['Screenshot.png','View image'],['Unidentified file','Open file']];const items=types.map(([title],i)=>({id:'file-'+i,title,delivery:'link',canView:true,viewUrl:'/api/client-documents/file-'+i+'?clientId=1&source=link&revision=2',publishedAt:'2026-11-23T00:00:00Z'}));
 await page.route('**/api/client-documents?**',route=>route.fulfill({json:{items,hasMore:false}}));await page.goto('/document-library?client=1');for(const [index,[title,label]] of types.entries())await expect(page.getByRole('listitem').filter({hasText:title}).getByRole('link',{name:label,exact:true})).toHaveAttribute('href',items[index].viewUrl);
});
