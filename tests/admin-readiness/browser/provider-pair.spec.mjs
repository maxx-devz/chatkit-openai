import {test,expect} from '@playwright/test';
const chat='sk-proj-fixture-chat-12345678',adminKey='sk-admin-fixture-report-12345678';
async function fixture(page,{paired=true,reject=false}={}){
 const writes=[];let saved=false;
 const settings=()=>({ready:true,reportingReady:true,activeProvider:'openai',database:{connected:true},providers:[{id:'openai',configured:true,keySuffix:'5678',model:'gpt-6-luna',generationOptions:{reasoningEffort:'auto'},reporting:{paired:paired||saved,projectId:'proj_A',organizationId:'org-A'}},{id:'openrouter',configured:false,model:'',generationOptions:{}}]});
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/admin/provider-settings'){
   if(request.method()==='GET')return route.fulfill({json:settings()});const body=request.postDataJSON();writes.push({method:request.method(),body});
   if(reject)return route.fulfill({status:400,json:{error:'OpenAI denied access. Nothing was saved.'}});
   if(request.method()==='POST')return route.fulfill({json:{provider:'openai',verified:true,defaultModel:'gpt-6-luna',models:[{id:'gpt-6-luna',label:'GPT 6 Luna',supportsTools:true,availability:{status:'listed'}}]}});
   saved=true;return route.fulfill({json:{...settings(),activation:{provider:'openai',id:'gpt-6-luna',generationTested:false}}});
  }
  return route.fulfill({json:{ok:true,clients:[],allowed:false}});
 });return writes;
}
test('Replacing chat key requires paired reporting fields; saves clear both secrets on desktop and mobile',async({page},info)=>{
 const writes=await fixture(page);await page.goto('/admin?view=security');const panel=page.locator('#ai-provider-settings');await expect(panel.getByText('Paired',{exact:true})).toBeVisible();
 await panel.getByLabel('OpenAI API key',{exact:true}).fill(chat);await expect(panel.getByRole('button',{name:'Verify & load models'})).toBeDisabled();
 await panel.getByLabel('Organization Admin API key',{exact:true}).fill(adminKey);await expect(panel.getByRole('button',{name:'Verify & load models'})).toBeEnabled();
 await panel.getByRole('button',{name:'Verify & load models'}).click();await expect(panel.getByRole('button',{name:'Save & activate OpenAI'})).toBeEnabled();await panel.getByRole('button',{name:'Save & activate OpenAI'}).click();
 await expect(panel.getByLabel('OpenAI API key',{exact:true})).toHaveValue('');await expect(panel.getByLabel('Organization Admin API key',{exact:true})).toHaveValue('');expect(writes.map(w=>w.method)).toEqual(['POST','PUT']);expect(Object.keys(writes[1].body.reporting)).toEqual(['adminKey']);await expect(panel.getByLabel('Portal project ID',{exact:true})).toHaveCount(0);await expect(panel.getByLabel('OpenAI organization ID',{exact:true})).toHaveCount(0);
 const box=await panel.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(box.scroll).toBeLessThanOrEqual(box.width+2);await panel.screenshot({path:info.outputPath('paired-openai-settings.png')});
});
test('Existing unpaired setup prompts for both reporting identifiers and rejected pair stays editable',async({page})=>{
 const writes=await fixture(page,{paired:false,reject:true});await page.goto('/admin?view=security');const panel=page.locator('#ai-provider-settings');await expect(panel.getByText('Setup needed',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Verify & load models'})).toBeDisabled();
 await panel.getByLabel('Organization Admin API key',{exact:true}).fill(adminKey);await panel.getByRole('button',{name:'Verify & load models'}).click();await expect(panel.getByRole('alert')).toContainText('OpenAI denied access');expect(writes).toHaveLength(1);await expect(panel.getByRole('button',{name:'Save & activate OpenAI'})).toBeDisabled();
});
