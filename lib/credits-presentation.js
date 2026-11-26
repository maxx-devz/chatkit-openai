export function creditNumber(value) {
  if(value==null)return "Not available";
  const number=Number(value);
  if(!Number.isFinite(number))return "Not available";
  // Preserve a visible indication for nonzero usage that would round to zero.
  if(number!==0 && Math.abs(number)<0.005)return number<0?"−<0.01":"<0.01";
  return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(number);
}

export function planUsageLabel(data) {
  return data.usageState==='running'?'Reply in progress':'Contact administrator';
}

export function balancePresentation(data,error="") {
  if(error)return {label:"Unavailable",detail:"The balance could not be refreshed. Open Credits to retry.",state:"unavailable"};
  if(!data)return {label:"Loading…",detail:"Checking your current reporting balance.",state:"loading"};
  if(!data.ready)return {label:"Unavailable",detail:data.setupMessage,state:"unavailable"};
  if(data.mode==="subscription" && data.configured)return {label:data.code==="plan_pending"?planUsageLabel(data):data.month?creditNumber(data.availableCredits):"Not activated",detail:data.message,state:data.canGenerate?"available":"unavailable"};
  if(!data.pricing)return {label:"Not configured",detail:"AOC pricing is not configured for this period.",state:"unavailable"};
  if(data.allocatedCredits===null)return {label:"Allowance not set",detail:"Pricing does not assign credits. AOC can set a reporting allowance for this month separately.",state:"unassigned"};
  if(data.incomplete)return {label:"Not confirmed",detail:"Some usage costs are missing. Known usage is a subtotal, so the remaining balance is not confirmed.",state:"incomplete"};
  if(data.availableCredits==null)return {label:"Not assigned",detail:"No reporting allowance has been assigned for this period.",state:"unavailable"};
  return {label:creditNumber(data.availableCredits),detail:data.partialHistory?"Remaining allowance for recorded usage only; earlier usage is not included.":data.estimatedEvents?"Remaining reporting allowance includes estimated provider costs.":"Remaining reporting allowance for the current period.",state:Number(data.availableCredits)===0?"zero":"available"};
}

export function creditActivity(row) {
  if(row.kind==="allocation")return "Reporting allowance added";
  if(row.kind==="adjustment")return "Manual allowance adjustment";
  if(row.kind==="fixed_fee")return "Monthly AOC service fee";
  const activity=row.cost_kind==="hosted_tool"?"AI tool activity":row.status==="failed"?"Unsuccessful AI request":row.status==="cancelled"?"Cancelled AI request":"AI usage";
  return row.credits==null?activity+" · cost details missing":activity;
}

export function usageBasis(row) {
  if(row.basis==="manual")return "Recorded allowance";
  if(row.basis==="unknown" || row.credits==null)return "Awaiting cost details";
  return row.basis==="estimated"?"Calculated estimate":"Provider-reported cost";
}

export function creditSnapshot(value,now=new Date()) {
  if(!value)return now.toISOString();
  if(typeof value!=="string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString()!==value || Date.parse(value)>now.getTime()+60000)
    throw new TypeError("Refresh transactions before selecting another page.");
  return value;
}
