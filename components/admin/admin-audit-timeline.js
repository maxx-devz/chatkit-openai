"use client";
import {useEffect,useState} from 'react';
import AdminActivityTable from './admin-activity-table';
import styles from './admin-activity.module.css';
const empty={clientId:'',outcome:'',category:'',actorId:'',reference:''};
const labels={succeeded:'Completed',failed:'Failed',denied:'Access denied',cancelled:'Cancelled',info:'Additional sign-in step',blocked:'Validation blocked',started:'Outcome not recorded'};
const title=value=>String(value).replace(/^admin\./,'').replace(/^ui\./,'Browser: ').replaceAll(/[_.]/g,' ');
export default function AdminAuditTimeline(){
 const [draft,setDraft]=useState(empty),[query,setQuery]=useState(empty),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const [asOf,setAsOf]=useState('');
 useEffect(()=>{const controller=new AbortController();let valid=true;
  const params=new URLSearchParams({...query,page:String(page)});if(asOf)params.set('asOf',asOf);
  fetch('/api/admin/audit-events?'+params,{cache:'no-store',signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error||'Activity could not be loaded.');if(valid)setData(result);}).catch(e=>{if(valid&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(valid)setBusy(false);});return()=>{valid=false;controller.abort();};
 },[query,page,refresh,asOf]);
 const reload=()=>{setBusy(true);setError('');setAsOf('');setPage(1);setRefresh(n=>n+1);};
 function filter(event){event.preventDefault();setBusy(true);setError('');setAsOf('');setPage(1);setQuery({...draft});}
 function go(next){setBusy(true);setError('');setAsOf(data.asOf);setPage(next);}
 return <section className={styles.panel} aria-label="Admin activity timeline">
  <header className={styles.heading}><div><h2>Admin activity timeline</h2><p>Submitted administrator actions, saved values and request results.</p></div><button type="button" onClick={reload} disabled={busy}>Refresh activity</button></header>
  <p className={styles.hint}>Opening pages, reading reports and editing fields without submitting are not logged. Expand an action to see safe submitted values, confirmed saved values and its HTTP result. Credentials and private content are excluded.</p>
  <form onSubmit={filter}><div className={styles.filters}>
   <label>Client<select aria-label="Client" value={draft.clientId} onChange={e=>setDraft({...draft,clientId:e.target.value})}><option value="">All clients and AOC</option>{data?.clients?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Outcome<select aria-label="Outcome" value={draft.outcome} onChange={e=>setDraft({...draft,outcome:e.target.value})}><option value="">All outcomes</option>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
   <label>Activity type<select aria-label="Activity type" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}><option value="">All activity</option>{['change','authentication'].map(key=><option key={key} value={key}>{title(key)}</option>)}</select></label>
   <label>Administrator<select aria-label="Administrator" value={draft.actorId} onChange={e=>setDraft({...draft,actorId:e.target.value})}><option value="">All administrators</option>{data?.actors?.map((a,i)=><option key={a.id+'-'+i} value={a.id}>{a.name}</option>)}</select></label>
   <label>Request reference<input type="text" maxLength={36} placeholder="Paste a request UUID" value={draft.reference} onChange={e=>setDraft({...draft,reference:e.target.value})}/></label>
  </div><div className={styles.controls}><button disabled={busy}>Apply filters</button><button type="button" disabled={busy} onClick={()=>{setDraft(empty);setQuery(empty);reload();}}>Clear filters</button></div></form>
  {busy&&<p role="status">Loading activity…</p>}{error&&<p role="alert" className={styles.warning}>{error}</p>}
  {data?.ready===false&&<p className={styles.warning}>{data.message}</p>}
  {data?.ready&&<><div className={styles.stats}><div><span>Submitted actions</span><strong>{data.totals.all.toLocaleString()}</strong></div><div><span>Completed requests</span><strong>{data.totals.succeeded.toLocaleString()}</strong></div><div><span>Need review</span><strong>{data.totals.attention.toLocaleString()}</strong></div></div>
  <AdminActivityTable key={`${data.asOf}-${page}`} rows={data.rows} busy={busy}/>
  {!data.rows.length&&<p className={styles.empty}>No matching submitted actions. Saved changes and failed submissions will appear here.</p>}
  <nav className={styles.controls} aria-label="Activity pages"><button disabled={busy||page===1} onClick={()=>go(page-1)}>Newer activity</button><span>Page {page}</span><button disabled={busy||!data.hasMore} onClick={()=>go(page+1)}>Older activity</button></nav></>}
 </section>;
}
