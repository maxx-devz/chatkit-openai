export const reportNumber=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('en-US').format(value):'Unavailable';
export function reportUsd(value){return value===null||value===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6}).format(Number(value));}
function cell(value){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function openAIUsageCsv(report){
 const rows=[['Record type','UTC date','Organization ID','Project','Model','Cost category','Requests','Input tokens (includes cached)','Cached input tokens','Cache write tokens','Output tokens','Provider cost USD']];
 if(report?.usage?.status==='ready')for(const row of report.usage.rows)rows.push(['usage',row.date,report.organizationId||'Not supplied',row.projectId,row.model,'',row.requests,row.inputTokens,row.cachedInputTokens,row.cacheWriteTokens,row.outputTokens,'']);
 if(report?.costs?.status==='ready')for(const row of report.costs.rows)rows.push(['cost',row.date,report.organizationId||'Not supplied',row.projectId,'',row.lineItem,'','','','','',row.amountUsd]);
 return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
