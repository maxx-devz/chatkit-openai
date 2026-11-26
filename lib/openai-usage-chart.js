// Presentation only: provider observations are not client credit debits.
const dayMs=86400000;
export function usageTimeline(report,period,now=Date.now()){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))return [];
 const start=Date.parse(period+'-01T00:00:00Z'),next=new Date(start);next.setUTCMonth(next.getUTCMonth()+1);
 const cutoff=Math.min(next.getTime(),Date.parse(report?.range?.end||'')||now);
 if(cutoff<=start)return [];
 const length=Math.min(31,Math.ceil((cutoff-start)/dayMs));
 const usageReady=report?.usage?.status==='ready',costReady=report?.costs?.status==='ready';
 const days=Array.from({length},(_,index)=>({date:new Date(start+index*dayMs).toISOString().slice(0,10),cost:costReady?0:null,input:usageReady?0:null,output:usageReady?0:null,cached:usageReady?0:null,requests:usageReady?0:null}));
 const byDate=new Map(days.map(day=>[day.date,day]));
 if(usageReady)for(const row of report.usage.rows){const day=byDate.get(row.date);if(!day)continue;
  for(const [key,field] of [['input','inputTokens'],['output','outputTokens'],['cached','cachedInputTokens'],['requests','requests']])day[key]=day[key]!==null&&Number.isSafeInteger(row[field])&&row[field]>=0?day[key]+row[field]:null;
 }
 if(costReady)for(const row of report.costs.rows){const day=byDate.get(row.date);if(!day)continue;const amount=Number(row.amountUsd);day.cost=day.cost!==null&&row.amountUsd!==null&&row.amountUsd!==undefined&&Number.isFinite(amount)?day.cost+amount:null;}
 return days;
}
export function chartDomain(values,money=false){
 const finite=values.filter(Number.isFinite),low=Math.min(0,...finite),high=Math.max(0,...finite);
 if(!finite.length)return {min:0,max:1,ticks:[0,.25,.5,.75,1]};
 const target=(high-low||1)/4,power=10**Math.floor(Math.log10(target)),fraction=target/power;
 const nice=(fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power,step=money?nice:Math.max(1,nice);
 const min=Math.floor(low/step)*step,max=Math.max(min+step,Math.ceil(high/step)*step);
 const ticks=Array.from({length:Math.min(10,Math.round((max-min)/step)+1)},(_,i)=>Number((min+i*step).toPrecision(12)));
 return {min,max,ticks};
}
function curve(points){if(!points.length)return '';let path=`M${points[0][0]},${points[0][1]}`;for(let i=1;i<points.length;i++){const before=points[i-1],point=points[i],mid=(before[0]+point[0])/2;path+=` C${mid},${before[1]} ${mid},${point[1]} ${point[0]},${point[1]}`;}return path;}
export function usageSeriesPaths(points,key,{x,y,base}={}){
 const segments=[];let segment=[];
 for(let i=0;i<points.length;i++){const point=points[i],value=point[key],bottom=base?point[base]:0;
  if(!Number.isFinite(value)||!Number.isFinite(bottom)){if(segment.length)segments.push(segment);segment=[];continue;}
  segment.push({x:x(i),top:y(value+bottom),bottom:y(bottom)});
 }if(segment.length)segments.push(segment);
 return segments.map(group=>{const top=curve(group.map(p=>[p.x,p.top])),lower=curve([...group].reverse().map(p=>[p.x,p.bottom]));return {line:top,area:top+' '+lower.replace(/^M/,'L')+' Z'};});
}
