export const CLIENT_ASSISTANT_NAME="AOC AI";
export function auditActionLabel(action) {
  return ({create:"Client login created",role_change:"Client role changed",deactivate:"Client access deactivated",reactivate:"Client access reactivated",
    "client.document.add":"Reference added","client.document.remove":"Reference removed","client.audit.read":"Audit log viewed",
    "aoc.ai_usage.reset":"AI usage and consumed credits reset",
  "aoc.ai_usage.clear":"AI chat activity cleared","client_ai.reply":"AI request","admin_ai.reply":"Administrator AI request","builder.preview":"Assistant preview",
    "aoc.client.create":"Client workspace created","aoc.client.update":"Client settings updated","aoc.client.usage_reset":"AI request allowance reset"})[action] || "Other recorded activity";
}
export function referenceColumn(column) {return column.stage==="other" && /\b(notes?|ideas?)\b/i.test(column.name || "");}
export function workColumns(columns) {return columns.filter(column=>column.stage!=="done" && !referenceColumn(column));}
export function orderedWorkflowColumns(columns) {
  const rank=column=>referenceColumn(column)?5:({review:0,in_progress:1,todo:2,other:3,done:4})[column.stage] ?? 3;
  return columns.map((column,index)=>({column,index})).sort((a,b)=>rank(a.column)-rank(b.column) || a.index-b.index).map(item=>item.column);
}
