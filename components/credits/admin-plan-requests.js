"use client";
import {useRef,useState} from 'react';
import ActionCue from '@/components/portal-ui/action-cue';
import styles from './credits.module.css';
import RequestGrant,{requestDecision} from './request-grant';
const kindLabel=row=>row.kind==='upgrade'?'Plan upgrade':'Extra AI credits';
const dateLabel=value=>value?new Date(value).toLocaleString():'Date unavailable';
export default function AdminPlanRequests({data,clientId,clientName,onReview,refresh,onFeedback,feedback}) {
 const pending=data.requests.filter(row=>row.status==='pending');
 const history=data.requests.filter(row=>row.status!=='pending');
 const [declining,setDeclining]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef('');
 function startDecline(row){setDeclining(row.id);setReason('');setError('');key.current='';}
 function cancel(){setDeclining('');setReason('');setError('');key.current='';}
 async function decline(event){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   key.current ||= crypto.randomUUID();
   const response=await fetch('/api/admin/client-plan',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'decline',clientId,requestId:declining,reason:reason.trim(),idempotencyKey:key.current})});
   const value=await response.json();if(!response.ok||value.ok!==true)throw Error(value.error||'The decision could not be confirmed. Try again.');
   onFeedback({action:'request',title:value.duplicate?'Decision already recorded':'Request declined',message:'No payment or credits changed.'});cancel();refresh();
  }catch(failure){setError(failure.message||'The request could not be declined. Try again.');}finally{setBusy(false);}
 }
 return <section data-action-card={pending.length?'warning':'info'} className={styles.section} aria-label="Client requests">
  <div className={styles.heading}><div><ActionCue tone={pending.length?'warning':'info'}>{pending.length?'Needs your review':'Client requests'}</ActionCue><h3>Client requests</h3></div><span className={styles.requestCount}>{pending.length} pending</span></div>
  <p>Review {clientName?`${clientName}'s`:'this client’s'} message, agree the credits and price, then confirm payment before adding credits.</p>
  {feedback?.action==='request'&&<div className={styles.saveFeedback} role="status"><div><strong>{feedback.title}</strong><p>{feedback.message}</p></div></div>}
  {pending.length?<div className={styles.requestTable}><table><caption>Pending requests for this client</caption><thead><tr><th scope="col">Submitted</th><th scope="col">Request</th><th scope="col">Client message</th><th scope="col">Review</th></tr></thead><tbody>{pending.map(row=><tr key={row.id}>
   <td data-label="Submitted">{dateLabel(row.created_at)}</td><td data-label="Request"><strong>{kindLabel(row)}</strong><span className={styles.pendingBadge}>Awaiting review</span></td><td data-label="Client message" className={styles.requestMessage}>{row.note}</td><td data-label="Review"><div className={styles.requestActions}>
    <button type="button" className={styles.primary} disabled={busy||Boolean(declining)} onClick={()=>onReview(row)}>{row.kind==='upgrade'?'Review monthly plan':data.month?'Review & add credits':'Activate monthly plan'}</button>
    <button type="button" disabled={busy||Boolean(declining)} onClick={()=>startDecline(row)}>Decline request</button>
   </div></td></tr>)}</tbody></table></div>:<p className={styles.requestEmpty}>No requests awaiting review.</p>}
  {pending.length>0&&!data.month&&<p className={styles.notice}>This month is not activated. Confirm the monthly plan payment first; the request stays pending until you record its paid credit addition.</p>}
  {declining&&<form onSubmit={decline} className={styles.declineConfirmation} aria-label="Confirm request decline" aria-busy={busy}>
   <strong>Decline this request?</strong><p>The client will see a declined status. Their plan and credits will stay unchanged.</p>
   <label>Reason for declining<input autoFocus required maxLength={300} value={reason} disabled={busy} onChange={event=>{setReason(event.target.value);setError('');key.current='';}}/></label>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div className={styles.requestActions}><button type="submit" data-action="warning" disabled={busy||!reason.trim()}>{busy?'Recording decision…':'Confirm decline'}</button><button type="button" disabled={busy} onClick={cancel}>Cancel</button></div>
  </form>}
  {history.length>0&&<details className={styles.requestHistory}><summary>Recent resolved requests ({history.length})</summary><p>The original message is preserved. Credits actually added come from saved credit transactions and may differ from the request. A closed request has no remaining amount queued automatically.</p><div className={styles.requestTable}><table><caption>Recently approved or declined requests</caption><thead><tr><th scope="col">Submitted</th><th scope="col">Request</th><th scope="col">Original client message</th><th scope="col">Credits actually added</th><th scope="col">Decision</th></tr></thead><tbody>{history.map(row=><tr key={row.id}><td data-label="Submitted">{dateLabel(row.created_at)}</td><td data-label="Request">{kindLabel(row)}</td><td data-label="Client message" className={styles.requestMessage}>{row.note}</td><td data-label="Credits actually added"><RequestGrant row={row}/></td><td data-label="Decision"><span className={row.status==='approved'?styles.approvedBadge:styles.declinedBadge}>{requestDecision(row)}</span></td></tr>)}</tbody></table></div></details>}
 </section>;
}
