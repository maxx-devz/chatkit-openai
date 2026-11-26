"use client";
import {useEffect,useMemo,useState} from 'react';
import {usageTimeline} from '../../lib/openai-usage-chart.js';
import UsageAreaChart from './usage-area-chart';
import {openAIUsageCsv,reportNumber,reportUsd} from '../../lib/openai-usage-format.js';
import styles from './openai-usage-report.module.css';

export default function OpenAIUsageReport(){
 const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7)),[refresh,setRefresh]=useState(0);
 const [snapshot,setSnapshot]=useState({data:null,error:'',loading:true});
 const [selectedDay,setSelectedDay]=useState(null),[model,setModel]=useState('all');
 useEffect(()=>{const reset=()=>{setSnapshot({data:null,error:'',loading:true});setSelectedDay(null);setRefresh(value=>value+1);};window.addEventListener('aoc:provider-settings-changed',reset);return()=>window.removeEventListener('aoc:provider-settings-changed',reset);},[]);
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  setSnapshot(previous=>({...previous,loading:true,error:''}));
  async function load(){try{
   const response=await fetch('/api/admin/openai-usage?month='+encodeURIComponent(month),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(28000)])});
   const data=await response.json();
   if(response.status===409){if(active)setSelectedDay(null);if(active)setSnapshot({data:null,error:'The OpenAI connection changed. Refresh to load the current project report.',loading:false});return;}
   if(response.status===401||response.status===403){if(active)setSnapshot({data:null,error:'Sign in with an active AOC Admin account to view this report.',loading:false});return;}
   if(!response.ok)throw Error(data.error||'Reporting could not be loaded.');
   if(active)setSnapshot({data,error:'',loading:false});
  }catch(error){if(active)setSnapshot(previous=>({...previous,loading:false,error:error.name==='TimeoutError'?'OpenAI reporting timed out. Please retry.':error.message||'OpenAI reporting could not be loaded.'}));}}
  void load();return ()=>{active=false;controller.abort();};
 },[month,refresh]);
 const data=snapshot.data?.period===month?snapshot.data:null,usage=data?.usage,costs=data?.costs;
 const ready=usage?.status==='ready'||costs?.status==='ready';
 function download(){if(!ready)return;const url=URL.createObjectURL(new Blob([openAIUsageCsv(data)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='openai-usage-costs-'+month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const modelNames=useMemo(()=>[...new Set((usage?.rows||[]).map(row=>row.model||'__unknown'))].sort(),[usage]);
 const selectedModel=model==='all'||modelNames.includes(model)?model:'all';
 const selectedRows=useMemo(()=>(usage?.rows||[]).filter(row=>selectedModel==='all'||(row.model||'__unknown')===selectedModel),[usage,selectedModel]);
 const chartData=useMemo(()=>data?{...data,usage:usage?.status==='ready'?{...usage,rows:selectedRows}:usage}:null,[data,usage,selectedRows]);
 const points=useMemo(()=>usageTimeline(chartData,month),[chartData,month]);
 const modelLabel=value=>value==='all'?'All models':value==='__unknown'?'Model not supplied':value.replace(/^gpt-/,'GPT ').replaceAll('-',' ').replace(/\b(astra|sol|luna|mini|nano)\b/g,word=>word[0].toUpperCase()+word.slice(1));
 const totals=selectedRows.reduce((result,row)=>({input:result.input+row.inputTokens,output:result.output+row.outputTokens,requests:result.requests+row.requests,cached:result.cached===null||row.cachedInputTokens===null?null:result.cached+row.cachedInputTokens}),{input:0,output:0,cached:0,requests:0});
 const visibleTotals=usage?.status==='ready'?totals:{};
 const missing=data?.configured===false;
 const day=points.find(point=>point.date===selectedDay);
 const waiting=missing?'Not connected':snapshot.loading&&!data?'Loading…':'Unavailable';
 const amount=(value,formatter=reportNumber)=>missing||value===null||value===undefined?waiting:formatter(value);
 const tokenTotal=usage?.status==='ready'?totals.input+totals.output:null;
 const stamp=data?.fetchedAt?new Date(data.fetchedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC':null;
 const chartMessage=missing?'Your chart will appear after reporting is connected.':snapshot.loading?'Loading provider activity…':'Reporting is unavailable. Refresh to try again.';
 return <section className={styles.report} aria-label="OpenAI usage & costs" aria-busy={snapshot.loading}>
  <div className={styles.heading}><div><span className={styles.eyebrow}>OPENAI USAGE & COSTS</span><h3>Adoption &amp; consumption</h3><p>Track your OpenAI spending and model activity.</p></div><span className={`${styles.connection} ${ready?styles.connected:''}`}><i/>{missing?'Admin key required':ready?'Provider reported':snapshot.loading?'Loading report':'Report unavailable'}</span></div>
  <div className={styles.controls}><label>Report month · UTC<input type="month" max={new Date().toISOString().slice(0,7)} value={month} onChange={event=>{if(event.target.value){setMonth(event.target.value);setSelectedDay(null);}}}/></label><button type="button" disabled={snapshot.loading} onClick={()=>setRefresh(value=>value+1)}>{snapshot.loading?'Loading report…':'Refresh OpenAI report'}</button><button type="button" disabled={!ready||snapshot.loading} onClick={download}>Export OpenAI CSV</button><a className={styles.dashboardLink} href="https://platform.openai.com/usage" target="_blank" rel="noreferrer">Open OpenAI dashboard ↗</a></div>
  {snapshot.error&&<p className={styles.warning} role="alert">{snapshot.error}{data?' Last successful figures remain visible.':''}</p>}
  {data?.configured&&<div className={styles.scope}><strong>{data.scope.kind==='projects'?'Selected OpenAI projects':'Entire OpenAI organization'}</strong><span>{data.scope.kind==='projects'?'Saved project filter · '+data.scope.projectIds.join(', '):'Includes other projects and applications. Organization ID: '+(data.organizationId||'Not supplied by OpenAI')}</span></div>}
  {data?.connectionSource==='paired'&&data.organizationMatch==='not_supplied'&&<p className={styles.warning}>OpenAI did not supply enough organization metadata to compare both keys. These totals belong to the reporting key’s organization; they are not verified as portal-only spending.</p>}
  {usage?.status==='unavailable' &&<p role="alert" className={styles.warning}><strong>Tokens unavailable. </strong>{usage.message}</p>}
  {costs?.status==='unavailable'&&<p role="alert" className={styles.warning}><strong>Costs unavailable. </strong>{costs.message}</p>}
  <div className={styles.consumption}>
   <div className={styles.metricHeading}><div><h4>OpenAI cost · USD</h4><strong className={styles.total}>{amount(costs?.status==='ready'?costs.totalUsd:null,reportUsd)}</strong><p>Provider-reported spending for the selected period</p></div><span className={styles.timestamp}>{stamp?'Updated '+stamp:'Waiting for reporting connection'}</span></div>
   <UsageAreaChart points={points} kind="cost" label="OpenAI spending history" available={costs?.status==='ready'} emptyMessage={chartMessage} selectedDate={selectedDay} onSelectDate={setSelectedDay}/>
  </div>
  <div className={styles.activityHeading}><div><h3>Model activity</h3><p>Compare tokens and model requests. Dollar costs above include all models.</p></div><label className={styles.modelFilter}>Model<select aria-label="Chart model" value={selectedModel} onChange={event=>setModel(event.target.value)}><option value="all">All models</option>{modelNames.map(name=><option key={name} value={name}>{modelLabel(name)}</option>)}</select></label></div>
  {!!modelNames.length&&<div className={styles.modelBadges} role="group" aria-label="Models in this report">{modelNames.slice(0,6).map((name,index)=><button type="button" key={name} aria-pressed={selectedModel===name} onClick={()=>setModel(selectedModel===name?'all':name)}><i style={{background:['#078cff','#7559dc','#008c82','#c57b16','#c25783','#486a96'][index]}}/><span>{modelLabel(name)}</span><small>{reportNumber((usage.rows||[]).filter(row=>(row.model||'__unknown')===name).reduce((total,row)=>total+row.inputTokens+row.outputTokens,0))} tokens</small></button>)}</div>}
  <div className={styles.activityGrid}>
   <div className={styles.activityPanel}><div className={styles.metricHeading}><div><h4>Tokens</h4><strong className={styles.total}>{amount(tokenTotal)}</strong></div><span className={styles.timestamp}>{stamp?'Updated '+stamp:'Not connected'}</span></div><div className={styles.tokenSummary}><span>Input <b>{amount(visibleTotals.input)}</b></span><span>Output <b>{amount(visibleTotals.output)}</b></span><span>Cached input <b>{amount(visibleTotals.cached)}</b></span></div><UsageAreaChart points={points} kind="tokens" contextLabel={modelLabel(selectedModel)} label="OpenAI token history" available={usage?.status==='ready'} emptyMessage={chartMessage} selectedDate={selectedDay} onSelectDate={setSelectedDay}/><p className={styles.chartNote}>{modelLabel(selectedModel)} · Cached input is included in input tokens.</p></div>
   <div className={styles.activityPanel}><div className={styles.metricHeading}><div><h4>Model requests</h4><strong className={styles.total}>{amount(visibleTotals.requests)}</strong></div><span className={styles.timestamp}>{stamp?'Updated '+stamp:'Not connected'}</span></div><p className={styles.requestSummary}>{modelLabel(selectedModel)} · One chat can make several model requests.</p><UsageAreaChart points={points} kind="requests" contextLabel={modelLabel(selectedModel)} label="OpenAI model request history" available={usage?.status==='ready'} emptyMessage={chartMessage} selectedDate={selectedDay} onSelectDate={setSelectedDay}/></div>
  </div>
  {day&&<div className={styles.dayDetails} aria-label="Selected day usage"><div><strong>{new Date(day.date+'T00:00:00Z').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})} · UTC</strong><p>{modelLabel(selectedModel)} · Provider-reported daily totals. Costs cover all models.</p></div><dl><div><dt>Cost</dt><dd>{day.cost===null?'Unavailable':reportUsd(String(day.cost))}</dd></div><div><dt>Input tokens</dt><dd>{reportNumber(day.input)}</dd></div><div><dt>Output tokens</dt><dd>{reportNumber(day.output)}</dd></div><div><dt>Model requests</dt><dd>{reportNumber(day.requests)}</dd></div></dl><div className={styles.selectedModels}><strong>Models on this date</strong>{[...new Set(selectedRows.filter(row=>row.date===day.date).map(row=>row.model||"Not supplied"))].map(name=><span key={name}>{name}</span>)}{!selectedRows.some(row=>row.date===day.date)&&<span>No reported requests</span>}</div><button type="button" onClick={()=>setSelectedDay(null)}>Clear date selection</button></div>}
  {missing&&<div className={styles.setup}><div className={styles.setupHeading}><span className={styles.setupIcon} aria-hidden="true">↗</span><div><strong>Connect reporting</strong><p>{data.setupMessage}</p><p>Configure <code>OPENAI_ADMIN_KEY</code> for environment-only reporting, or pair the saved chat connection below. No usage figures are shown until connected.</p></div></div><a className={styles.dashboardLink} href="/admin?view=security#ai-provider-settings">Configure chat &amp; reporting keys</a><details><summary>How to connect OpenAI reporting</summary><ol><li>Create an organization Admin API key with Usage and Costs read access.</li><li>Set this key privately on the Next.js server.</li><li>Optionally set <code>OPENAI_USAGE_PROJECT_IDS</code> to restrict the report to portal projects.</li></ol><a href="https://platform.openai.com/settings/organization/admin-keys" target="_blank" rel="noreferrer">Create reporting key ↗</a><p>Keep the Admin key out of chat and client settings. It does not replace your paid chat key.</p></details></div>}
  {data?.configured&&<>
   {usage?.status==='ready'&&<details className={styles.details} open><summary>Token usage by day and model ({usage.rows.length})</summary>{usage.rows.length?<div className={styles.table}><table><caption>OpenAI token usage · {month} UTC</caption><thead><tr><th>Date · UTC</th><th>Organization ID</th><th>Project ID</th><th>Model</th><th>Requests</th><th>Input</th><th>Cached input</th><th>Output</th></tr></thead><tbody>{usage.rows.map((row,index)=><tr key={index}><td>{row.date}</td><td>{data.organizationId||'Not supplied'}</td><td>{row.projectId||'Unassigned / not supplied'}</td><td>{row.model||'Not supplied'}</td><td>{reportNumber(row.requests)}</td><td>{reportNumber(row.inputTokens)}</td><td>{reportNumber(row.cachedInputTokens)}</td><td>{reportNumber(row.outputTokens)}</td></tr>)}</tbody></table></div>:<p>No token usage has been reported for this month.</p>}</details>}
   {costs?.status==='ready'&&<details className={styles.details}><summary>Costs by day and category ({costs.rows.length})</summary>{costs.rows.length?<div className={styles.table}><table><caption>OpenAI reported costs · {month} UTC</caption><thead><tr><th>Date · UTC</th><th>Organization ID</th><th>Project ID</th><th>Model</th><th>Cost category</th><th>USD</th></tr></thead><tbody>{costs.rows.map((row,index)=><tr key={index}><td>{row.date}</td><td>{data.organizationId||'Not supplied'}</td><td>{row.projectId||'Unassigned / not supplied'}</td><td>Not attributed by Costs API</td><td>{row.lineItem||'Not supplied'}</td><td>{reportUsd(row.amountUsd)}</td></tr>)}</tbody></table></div>:<p>No costs have been reported for this month.</p>}</details>}
   <p className={styles.note}>OpenAI reports can be delayed. Costs can include tools, images and storage that are not represented by completion token totals. Costs are grouped by project and category, not by individual chat. This report does not change a client’s credits or resolve a specific reply’s usage record.</p>
   <p className={styles.updated}>Fetched {new Date(data.fetchedAt).toLocaleString()} · {data.cached?'Cached report':'Provider refresh'} · Server cache: {data.cacheSeconds} seconds. Refresh is manual.</p>
  </>}
 </section>;
}
