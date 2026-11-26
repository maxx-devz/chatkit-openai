import "server-only";
import {createOrganizationUsageReporter} from './openai-organization-usage.js';
import {providerState,getRuntimeProvider} from './provider-settings.js';
import {unsealReportingKey} from './provider-secrets.js';
import {reportingBindingMatches} from './openai-reporting-pair.js';
const environmentReporter=createOrganizationUsageReporter({env:process.env});
// This mutable object is consumed synchronously before the adapter's first await.
const pairedEnv={},pairedReporter=createOrganizationUsageReporter({env:pairedEnv});
export async function loadOpenAIOrganizationUsage(month){
 const {rows}=await providerState(),row=rows.find(item=>item.provider==='openai');
 if(!row)return {...await environmentReporter(month),connectionSource:'environment'};
 const runtime=await getRuntimeProvider('openai');
 if(!row.encrypted_reporting_key||!reportingBindingMatches(row.reporting_binding,runtime.apiKey)){
  const empty=await createOrganizationUsageReporter()(month);
  return {...empty,connectionSource:'unpaired',setupMessage:'Pair the saved OpenAI chat key with its organization Admin key in AI provider settings. Environment reporting is not used for an unpaired saved chat key.'};
 }
 pairedEnv.OPENAI_ADMIN_KEY=unsealReportingKey(row.encrypted_reporting_key,process.env.PROVIDER_SETTINGS_SECRET);
 pairedEnv.OPENAI_USAGE_PROJECT_IDS=row.reporting_binding.scope==='organization'?'':row.reporting_binding.projectId;
 pairedEnv.OPENAI_USAGE_ORGANIZATION_ID=row.reporting_binding.organizationId||'';
 const result=await pairedReporter(month);
 const latest=(await providerState()).rows.find(item=>item.provider==='openai');
 if(!latest||latest.encrypted_key!==row.encrypted_key||latest.encrypted_reporting_key!==row.encrypted_reporting_key||JSON.stringify(latest.reporting_binding)!==JSON.stringify(row.reporting_binding))throw Object.assign(Error('Reporting connection changed'),{code:'reporting_connection_changed'});
 return {...result,connectionSource:'paired',organizationId:result.organizationId||row.reporting_binding.organizationId||null,organizationMatch:row.reporting_binding.organizationMatch||"verified"};
}
