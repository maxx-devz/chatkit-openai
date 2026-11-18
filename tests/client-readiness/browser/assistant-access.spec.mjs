import {test,expect} from '@playwright/test';
async function fixture(page,access) {
  const calls={access:0,replies:0};
  await page.route('https://cdn.platform.openai.com/**',route=>route.fulfill({contentType:'application/javascript',body:"if(!customElements.get('openai-chatkit')) {\n  customElements.define('openai-chatkit',class extends HTMLElement {\n    setOptions() {\n      if(!this.querySelector('textarea'))this.innerHTML='<div role=\"region\" aria-label=\"Connected assistant\"><label>Your message<textarea placeholder=\"Ask a question\"></textarea></label></div>';\n      setTimeout(()=>this.dispatchEvent(new CustomEvent('chatkit.ready')),100);\n    }\n    async setThreadId(){}\n  });\n}"}));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/ai-access') {calls.access++;return access(route,calls.access);}
    if(url.pathname==='/api/conversations')return route.fulfill({json:{conversations:[]}});
    if(url.pathname==='/api/chatkit')calls.replies++;
    return route.fulfill({json:{ok:true}});
  });
  return calls;
}
const allowed=route=>route.fulfill({json:{ai:{enabled:true,uploadsEnabled:false}}});
test('assistant connects automatically on reload in Strict Mode without pressing Reconnect',async({page})=>{
  const calls=await fixture(page,allowed);
  await page.goto('/assistant');
  await expect(page.getByRole('region',{name:'Connected assistant'})).toBeVisible({timeout:6000});
  await page.reload();
  await expect(page.getByRole('region',{name:'Connected assistant'})).toBeVisible({timeout:6000});
  expect(calls.replies).toBe(0);
});

test('temporary access failures retry automatically without submitting a chat message',async({page})=>{
  const calls=await fixture(page,(route,count)=>count<=2?route.fulfill({status:503,json:{error:'Temporary fixture outage'}}):allowed(route));
  await page.goto('/assistant');
  await expect(page.getByRole('region',{name:'Connected assistant'})).toBeVisible({timeout:12000});
  expect(calls.access).toBeGreaterThanOrEqual(3);
  expect(calls.replies).toBe(0);
});
test('a timed-out access refresh recovers automatically and preserves the open composer',async({page})=>{
  let hangNext=false;
  const calls=await fixture(page,route=>{if(hangNext){hangNext=false;return;}return allowed(route);});
  await page.goto('/assistant');
  const chat=page.getByRole('region',{name:'Connected assistant'});
  await expect(chat).toBeVisible();
  await chat.getByRole('textbox',{name:'Your message'}).fill('Unsent draft stays here');
  const previous=calls.access;hangNext=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>calls.access,{timeout:18000}).toBeGreaterThan(previous+1);
  await expect(chat.getByRole('textbox',{name:'Your message'})).toHaveValue('Unsent draft stays here');
  expect(calls.replies).toBe(0);
});
for(const status of [401,403])test('access denial '+status+' stays blocked and is not retried as a connection outage',async({page})=>{
  const calls=await fixture(page,route=>route.fulfill({status,json:{error:'Denied'}}));
  await page.clock.install();
  await page.goto('/assistant');
  await expect(page.getByRole('status')).toContainText(status===401?'Your session expired':'Assistant access is unavailable');
  const count=calls.access;
  await page.clock.fastForward(10000);
  expect(calls.access).toBe(count);
  await expect(page.getByRole('region',{name:'Connected assistant'})).toHaveCount(0);
  expect(calls.replies).toBe(0);
});
test('restoring the network triggers an immediate access check',async({page})=>{
  let restored=false;
  const calls=await fixture(page,route=>restored?allowed(route):route.fulfill({status:503,json:{error:'Offline fixture'}}));
  await page.goto('/assistant');
  await expect(page.getByRole('status')).toContainText('Retrying automatically');
  restored=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('region',{name:'Connected assistant'})).toBeVisible();
  expect(calls.replies).toBe(0);
});
test('an administrator-paused assistant does not connect automatically',async({page})=>{
  const calls=await fixture(page,route=>route.fulfill({json:{ai:{enabled:false,uploadsEnabled:false}}}));
  await page.goto('/assistant');
  await expect(page.getByRole('status')).toContainText('Your AI assistant is paused');
  await expect(page.getByRole('region',{name:'Connected assistant'})).toHaveCount(0);
  expect(calls.replies).toBe(0);
});

test('an assistant opened in a hidden tab connects when that tab becomes visible',async({page})=>{
  await page.addInitScript(()=>{
    window.__assistantHidden=true;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__assistantHidden});
  });
  const calls=await fixture(page,allowed);
  await page.goto('/assistant');
  await expect(page.getByRole('status')).toContainText('Checking assistant access');
  expect(calls.access).toBe(0);
  await page.evaluate(()=>{window.__assistantHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.getByRole('region',{name:'Connected assistant'})).toBeVisible();
  expect(calls.replies).toBe(0);
});
