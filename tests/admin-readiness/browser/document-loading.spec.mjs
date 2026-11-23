import {test,expect} from '@playwright/test';
const library=title=>({items:[{id:'doc-1',title,description:'Approved client material.',publishedAt:'2026-11-23T00:00:00Z',delivery:'link',canView:true,viewUrl:'/allowed-document'}],hasMore:false});

test('a stalled document request ends with a retry instead of indefinite loading',async({page})=>{
 await page.clock.install();let calls=0,release;const held=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/client-documents?**',async route=>{calls++;if(calls===1)await held;await route.fulfill({json:library('Recovered document')});});
 await page.goto('/document-library?client=1');await expect.poll(()=>calls).toBe(1);await expect(page.getByText('Loading your documents...',{exact:true})).toBeVisible();
 await page.clock.fastForward(21000);await expect(page.getByRole('alert').filter({hasText:'taking longer'})).toBeVisible();
 await expect(page.getByText('Loading your documents...',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('Recovered document',{exact:true})).toBeVisible();release();
});

test('invalid response content shows a safe error and retry can recover',async({page})=>{
 let calls=0;await page.route('**/api/client-documents?**',route=>{calls++;return calls===1?route.fulfill({contentType:'text/html',body:'<html>Unexpected gateway response</html>'}):route.fulfill({json:library('Approved report')});});
 await page.goto('/document-library?client=1');await expect(page.getByRole('alert').filter({hasText:'Documents could not be loaded'})).toBeVisible();
 await expect(page.getByText(/Unexpected token/)).toHaveCount(0);await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('Approved report',{exact:true})).toBeVisible();
});

test('returning to the tab revalidates documents and denies revoked access',async({page})=>{
 let revoked=false,calls=0;await page.route('**/api/client-documents?**',route=>{calls++;return revoked?route.fulfill({status:403,json:{error:'Your workspace access has changed.'}}):route.fulfill({json:library('Private approved report')});});
 await page.goto('/document-library?client=1');await expect(page.getByText('Private approved report',{exact:true})).toBeVisible();
 await page.evaluate(()=>{window.__libraryHidden=true;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__libraryHidden?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByText('Private approved report',{exact:true})).toBeVisible();revoked=true;
 await page.evaluate(()=>{window.__libraryHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByRole('alert').filter({hasText:'Your workspace access has changed.'})).toBeVisible();
 await expect(page.getByText('Private approved report',{exact:true})).toHaveCount(0);expect(calls).toBe(2);
});

test('authorized server data displays without the initial browser API request',async({page})=>{
 let calls=0;await page.route('**/api/client-documents?**',r=>{calls++;return r.abort('blockedbyclient');});
 await page.goto('/document-library?client=1&initial=ready');await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toBeVisible();
 await expect(page.getByText('Loading your documents...',{exact:true})).toHaveCount(0);expect(calls).toBe(0);
 await page.reload();await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toBeVisible();expect(calls).toBe(0);
});

test('server errors are actionable and retry reauthorizes through the API',async({page})=>{
 let calls=0;await page.route('**/api/client-documents?**',r=>{calls++;return r.fulfill({json:library('Retried server error')});});
 await page.goto('/document-library?client=1&initial=error');await expect(page.getByRole('alert')).toContainText('Documents could not be loaded');expect(calls).toBe(0);
 await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('Retried server error',{exact:true})).toBeVisible();expect(calls).toBe(1);
});

test('server data for a different client is ignored',async({page})=>{
 await page.route('**/api/client-documents?**',r=>r.fulfill({json:library('Current client only')}));
 await page.goto('/document-library?client=1&initial=foreign');await expect(page.getByText('Current client only',{exact:true})).toBeVisible();await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toHaveCount(0);
});

test('initial server data stays visible during capture and is removed after denied revalidation',async({page})=>{
 await page.route('**/api/client-documents?**',r=>r.fulfill({status:403,json:{error:'Your workspace access has changed.'}}));
 await page.goto('/document-library?client=1&initial=ready');await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toBeVisible();
 // Server markup is visible before hydration; first prove client handlers are ready.
 await page.getByLabel('Search document titles',{exact:true}).fill('prepare');await expect(page.getByRole('button',{name:'Clear search',exact:true})).toBeVisible();
 await page.evaluate(()=>{window.__libraryHidden=true;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__libraryHidden?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toBeVisible();
 await page.evaluate(()=>{window.__libraryHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByRole('alert').filter({hasText:'Your workspace access has changed.'})).toContainText('Your workspace access has changed.');await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toHaveCount(0);
});


test('screenshot visibility and focus transitions preserve the list and draft during a quiet access recheck',async({page})=>{
 let calls=0,release;const held=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/client-documents?**',async route=>{calls++;await held;await route.fulfill({json:library('SERVER_RENDERED_DOCUMENT')});});
 let navigations=0;page.on('request',request=>{if(request.resourceType()==='document')navigations++;});
 await page.goto('/document-library?client=1&initial=ready');await page.getByLabel('Search document titles',{exact:true}).fill('Unsaved search draft');await expect(page.getByRole('button',{name:'Clear search',exact:true})).toBeVisible();
 const transitions=()=>{window.__captureHidden=true;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__captureHidden?'hidden':'visible'});window.dispatchEvent(new Event('blur'));document.dispatchEvent(new Event('visibilitychange'));};
 await page.evaluate(transitions);await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toBeVisible();await expect(page.getByText('Loading your documents...',{exact:true})).toHaveCount(0);expect(calls).toBe(0);
 await page.screenshot({path:test.info().outputPath('document-list-during-capture.png')});
 await page.evaluate(()=>{window.__captureHidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>calls).toBe(1);await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toBeVisible();await expect(page.getByText('Loading your documents...',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Search document titles',{exact:true})).toHaveValue('Unsaved search draft');
 release();await expect(page.getByText('Approved client material.',{exact:true})).toBeVisible();expect(navigations).toBe(1);expect(calls).toBe(1);
});

test('an initial in-flight document read survives screenshot transitions without duplicate requests',async({page})=>{
 let calls=0,release;const held=new Promise(resolve=>{release=resolve;});await page.route('**/api/client-documents?**',async route=>{calls++;await held;await route.fulfill({json:library('Initial approved document')});});
 await page.goto('/document-library?client=1');await expect.poll(()=>calls).toBe(1);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
 release();await expect(page.getByText('Initial approved document',{exact:true})).toBeVisible();expect(calls).toBe(1);
});

test('switching clients during a background recheck cannot restore the previous client’s document',async({page})=>{
 let release,called=0;const held=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/client-documents?**',async route=>{const id=new URL(route.request().url()).searchParams.get('clientId');if(id==='1'){called++;await held;}await route.fulfill({json:library(id==='1'?'Previous private document':'Current client document')});});
 await page.goto('/document-library?client=1&initial=ready');await page.getByLabel('Search document titles',{exact:true}).fill('Draft');await expect(page.getByRole('button',{name:'Clear search',exact:true})).toBeVisible();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>called).toBe(1);
 await page.goto('/document-library?client=2');await expect(page.getByText('Current client document',{exact:true})).toBeVisible();release();await expect(page.getByText('Previous private document',{exact:true})).toHaveCount(0);await expect(page.getByText('SERVER_RENDERED_DOCUMENT',{exact:true})).toHaveCount(0);
});
