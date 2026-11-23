import {test,expect} from '@playwright/test';
const clients=[{id:'1',slug:'alpha',name:'Alpha Client',enabled:true},{id:'2',slug:'beta',name:'Beta Client',enabled:true}];
const driveUrl='https://docs.google.com/document/d/ApprovedFixture12345/edit';
async function fixture(page,{folder=false,failPublishOnce=false}={}) {
 const item={id:'12345678-abcd-4abc-8abc-123456789012',clientId:'1',kind:folder?'folder':'document',title:'Approved fixture report',description:'Website review findings and recommended next steps.',url:driveUrl,stage:4,revision:'1',status:'saved_not_published',updatedAt:'2026-11-23T00:00:00Z'},writes=[];
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),id=url.searchParams.get('clientId');
  if(url.pathname==='/api/admin/client-document-assignments') {
   if(request.method()==='GET')return route.fulfill({json:id?{setupReady:true,client:clients.find(c=>c.id===id),assignments:id==='1'?[item]:[],history:[]}:{clients}});
   const input=request.postDataJSON();writes.push(input);
   if(input.action==='publish'&&failPublishOnce&&writes.filter(w=>w.action==='publish').length===1)return route.fulfill({status:503,json:{error:'Fixture: publication could not be confirmed. Retry.'}});
   item.revision=String(Number(item.revision)+1);
   item.status=input.action==='publish'?'published_link':'saved_not_published';
   if(input.action==='publish'){item.category=input.category;item.stage=input.stage;}
   if(input.action==='save'){item.title=input.title;item.url=input.url;item.description=input.description||'';}
   return route.fulfill({json:{saved:true,id:item.id,revision:item.revision,status:item.status}});
  }
  if(url.pathname==='/api/admin/client-documents')return route.fulfill({json:{setupReady:true,connection:{configured:false,connected:false,message:'Missing optional Google configuration'},journey:null,releases:[],history:[]}});
  if(url.pathname==='/api/client-documents')return route.fulfill({json:{items:id==='1'&&item.status==='published_link'?[{id:item.id,title:item.title,description:item.description,category:item.category,stage:item.stage,delivery:'link',viewLabel:'Open in Google Docs',publishedAt:'2026-11-23T00:00:00Z',canView:true,downloadUrl:null,viewUrl:'/api/client-documents/'+item.id+'?clientId=1&mode=view&source=link&revision='+item.revision}]:[],journey:null,hasMore:false}});
  return route.fulfill({status:503,json:{error:'Isolated fixture; no database or Google requests.'}});
 });return {item,writes};
}
async function open(page){await page.goto('/admin/client-documents');await page.getByLabel('Client account',{exact:true}).selectOption('1');await expect(page.getByText('Private draft',{exact:true})).toBeVisible();}
async function publish(page){await page.getByRole('button',{name:'Publish link',exact:true}).click();await page.getByRole('checkbox',{name:/I reviewed the whole file/}).check();await page.getByRole('button',{name:'Confirm publication',exact:true}).click();await expect(page.getByText('Published to Alpha Client',{exact:true})).toBeVisible();}

test('an admin can publish an existing link and its client sees a Google open action without OAuth',async({page})=>{
 const f=await fixture(page);await open(page);
 await expect(page.getByText(/CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID/)).toHaveCount(0);await expect(page.getByRole('button',{name:'Connect Google Drive',exact:true})).toHaveCount(0);
 await publish(page);expect(f.writes).toHaveLength(1);expect(f.writes[0].confirmed).toBe(true);
 await expect(page.getByRole('status').filter({hasText:'Link published to Alpha Client.'})).toBeVisible();
 await page.goto('/document-library?client=1');await expect(page.getByText('Approved fixture report',{exact:true})).toBeVisible();await expect(page.getByText('Website review findings and recommended next steps.',{exact:true})).toBeVisible();
 const link=page.getByRole('link',{name:'Open in Google Docs',exact:true});await expect(link).toHaveAttribute('href',/source=link&revision=2/);await expect(link).toHaveAttribute('target','_blank');
 await expect(page.getByRole('link',{name:'Download',exact:true})).toHaveCount(0);await expect(page.getByText(/Google Drive controls file access and downloads/)).toBeVisible();
 await page.goto('/document-library?client=2');await expect(page.getByText('Approved fixture report',{exact:true})).toHaveCount(0);await expect(page.getByText(/No documents have been shared yet/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('drafts stay hidden and publication needs confirmation; folders cannot be published',async({page})=>{
 const f=await fixture(page);await page.goto('/document-library?client=1');await expect(page.getByRole('link',{name:'Open in Google Docs',exact:true})).toHaveCount(0);
 await open(page);await page.getByRole('button',{name:'Publish link',exact:true}).click();await page.getByRole('button',{name:'Confirm publication',exact:true}).click();expect(f.writes).toHaveLength(0);
 await page.unroute('**/api/**');await fixture(page,{folder:true});await open(page);await expect(page.getByRole('button',{name:'Publish link',exact:true})).toHaveCount(0);await expect(page.getByText(/Folder references stay private/)).toBeVisible();
});

test('unpublishing and editing withdraw the link from the client library',async({page})=>{
 const f=await fixture(page);await open(page);await publish(page);
 await page.getByRole('button',{name:'Unpublish link',exact:true}).click();await page.getByRole('button',{name:'Confirm unpublish',exact:true}).click();await expect(page.getByText('Private draft',{exact:true})).toBeVisible();
 await page.goto('/document-library?client=1');await expect(page.getByText('Approved fixture report',{exact:true})).toHaveCount(0);
 await open(page);await publish(page);await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Document title',{exact:true}).fill('Edited fixture report');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByText('Private draft',{exact:true})).toBeVisible();
 await page.goto('/document-library?client=1');await expect(page.getByText('Edited fixture report',{exact:true})).toHaveCount(0);expect(f.writes.filter(w=>w.action==='revoke')).toHaveLength(1);
});

test('failed publication retains its confirmation and reuses the same retry key',async({page})=>{
 const f=await fixture(page,{failPublishOnce:true});await open(page);await page.getByRole('button',{name:'Publish link',exact:true}).click();await page.getByRole('checkbox',{name:/I reviewed the whole file/}).check();await page.getByRole('button',{name:'Confirm publication',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Fixture:'})).toBeVisible();await expect(page.getByRole('checkbox',{name:/I reviewed the whole file/})).toBeChecked();
 await page.getByRole('button',{name:'Confirm publication',exact:true}).click();await expect(page.getByText('Published to Alpha Client',{exact:true})).toBeVisible();expect(f.writes).toHaveLength(2);expect(f.writes[0].operation).toBe(f.writes[1].operation);
});


test('the document library has no journey controls and publishes an edited description',async({page})=>{
 const f=await fixture(page);await open(page);
 await expect(page.getByText('Update verified journey progress',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Link journey stage',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Related journey stage (optional)',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Description',{exact:true}).fill('Audit findings, priorities and suggested next steps.');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('heading',{name:'Add document',exact:true})).toBeVisible();await publish(page);
 await page.goto('/document-library?client=1');await expect(page.getByRole('heading',{name:'Document Library',exact:true})).toBeVisible();await expect(page.getByText('Audit findings, priorities and suggested next steps.',{exact:true})).toBeVisible();
 for(const name of ['Your next action','Your journey'])await expect(page.getByRole('heading',{name,exact:true})).toHaveCount(0);
 await expect(page.getByRole('combobox')).toHaveCount(0);expect(f.writes.find(w=>w.action==='save').description).toContain('Audit findings');
 await page.screenshot({path:test.info().outputPath('simple-document-library.png'),fullPage:true});
});


test('document open actions match the known file type and retain the authorized URLs',async({page})=>{
 const types=[['Audit.PDF','View PDF',null],['Business spreadsheet','Open in Google Sheets','Open in Google Sheets'],['Client instructions','Open in Google Docs','Open in Google Docs'],['Presentation','Open in Google Slides','Open in Google Slides'],['Costs.xlsx','Open spreadsheet',null],['Screenshot.png','View image',null],['Unidentified file','Open file',null]];
 const items=types.map(([title,,viewLabel],index)=>({id:'file-'+index,title,viewLabel,delivery:'link',canView:true,viewUrl:'/api/client-documents/file-'+index+'?clientId=1&source=link&revision=2',publishedAt:'2026-11-23T00:00:00Z'}));
 await page.route('**/api/client-documents?**',route=>route.fulfill({json:{items,hasMore:false}}));await page.goto('/document-library?client=1');
 for(const [index,[title,label]] of types.entries()){const row=page.getByRole('listitem').filter({hasText:title});await expect(row.getByRole('link',{name:label,exact:true})).toHaveAttribute('href',items[index].viewUrl);}
 await expect(page.getByRole('link',{name:'Open in Google Drive',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
