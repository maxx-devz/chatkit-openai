"use client";
import ActionCue from "@/components/portal-ui/action-cue";
import {useRef,useState} from 'react';
import {creditNumber,planUsageLabel} from '@/lib/credits-presentation';
import {usd} from '@/lib/ai-spending-format';
import styles from './credits.module.css';
import RequestGrant,{requestDecision} from './request-grant';
export function PlanMetrics({data}) {return <div className={styles.metrics}>
 <article className={styles.metric}><span>Monthly portal plan</span><strong>{usd(data.month?.monthly_price??data.plan?.monthly_price)} / month</strong><small>Includes AI access and the credits shown. The plan price does not consume credits.</small></article>
 <article className={styles.metric}><span>Included this month</span><strong>{creditNumber(data.month?.included_credits)}</strong><small>{data.month?`${creditNumber(data.month.extra_credits)} extra credits approved`:'Waiting for payment confirmation.'}</small></article>
 <article className={styles.metric}><span>AI credits used</span><strong>{creditNumber(data.month?.used_credits)}</strong><small>Recorded completed usage. Unsuccessful replies do not consume client credits.</small></article>
 <article className={styles.metric}><span>{data.code==='plan_pending'?'Balance on hold':'Credits remaining'}</span><strong>{data.code==='plan_pending'?planUsageLabel(data):data.month?creditNumber(data.availableCredits):'Not activated'}</strong><small>{data.message}</small></article>
 </div>;}
export default function ClientPlanView({data,clientId,canRequest=false,refresh}) {
 const [kind,setKind]=useState('credits'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const key=useRef('');
 const pending=data.requests.some(row=>row.status==='pending');
 async function request(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{key.current ||= crypto.randomUUID();const response=await fetch('/api/client/plan',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-aoc-client':clientId},body:JSON.stringify({kind,note,idempotencyKey:key.current})});const value=await response.json();if(!response.ok)throw Error(value.error);setMessage('Request saved for your administrator. They will confirm the price and payment before adding credits.');key.current='';setNote('');refresh();}catch(failure){setError(failure.message);}finally{setBusy(false);}}
 return <div className={styles.page}>
 <header className={styles.heading}><div><p className={styles.eyebrow}>YOUR PORTAL PLAN</p><h1>Plan & AI credits</h1><p>{data.period} · UTC billing month</p></div><button type="button" onClick={refresh}>Refresh plan</button></header>
 <section id="overview" data-action-card="info" className={styles.section}><ActionCue tone="info">View your monthly plan</ActionCue><h2>Your monthly plan</h2><PlanMetrics data={data}/><p className={styles.notice}>{data.message}</p>
 <p>AI uses credits as replies are completed. The portal subscription price is separate from usage. Credits are checked before each reply; a reply already in progress may finish after the balance reaches zero.</p>
 <p>Each month needs admin payment confirmation. Unused credits and extra credits do not roll over. Files and saved conversations remain available subject to your normal permissions.</p></section>
 <section id="pricing" data-action-card="add" className={styles.section}><ActionCue tone="add">Request an addition · No automatic payment</ActionCue><h2>Need more credits?</h2><p>Ask for extra credits or an upgraded plan. Your administrator handles payment outside the portal. Sending a request does not charge you or add credits.</p>
 {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.notice}>{message}</p>}
 {pending?<p role="status">Your request is awaiting admin review.</p>:canRequest?<form onSubmit={request} className={styles.planForm}>
 <div className={styles.form}><label>Request type<select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);key.current='';}}><option value="credits">More AI credits</option><option value="upgrade">Upgrade my monthly plan</option></select></label>
 <label>What do you need?<input required maxLength={500} value={note} disabled={busy} placeholder="e.g. More credits for this month" onChange={e=>{setNote(e.target.value);key.current='';}}/></label></div>
 <button data-action="add" className={styles.primary} disabled={busy||!note.trim()}>{busy?'Sending…':'Request admin review'}</button></form>:<p>Your account can view this plan. Ask your client administrator to request changes.</p>}
 </section>
 <details id="history" className={styles.section}><summary>Previous requests</summary><p>Your message and the credits actually added are shown separately. A closed request may have a different agreed amount; no remaining amount is added automatically.</p>{data.requests.length?<ul>{data.requests.map(row=><li key={row.id}><strong>{row.kind==='upgrade'?'Plan upgrade':'Extra credits'} · {requestDecision(row)}</strong><p>Your original message: {row.note}</p><RequestGrant row={row}/><small>Requested {new Date(row.created_at).toLocaleDateString()}</small></li>)}</ul>:<p>No requests yet.</p>}</details>
 <section id="tokens" className={styles.section}><h2>How credits work</h2><p>1,000 credits represent US$1 of recorded AI provider cost. Costs may be calculated estimates rather than a final provider invoice. Provider outages and limits are separate from portal credits. If AI is unavailable, contact your administrator. Unsuccessful replies are not charged to your portal allowance.</p></section>
 </div>;
}
