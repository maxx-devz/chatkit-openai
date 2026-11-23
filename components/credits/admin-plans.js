"use client";
import {useEffect,useState} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import AdminClientPlan from './admin-client-plan';
import styles from './credits.module.css';
export default function AdminPlans({clientPath='/admin/credits'}) {
 const params=useSearchParams(),router=useRouter();const [clients,setClients]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/api/admin/client-plan',{cache:'no-store',signal:controller.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error||'Clients could not be loaded.');if(!Array.isArray(value.clients))throw Error('Clients could not be loaded.');return value.clients;}).then(value=>{if(!controller.signal.aborted)setClients(value);}).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);});return()=>controller.abort();},[]);
 const selected=params.get('client')||clients?.[0]?.id||'';const client=clients?.find(row=>String(row.id)===String(selected));
 return <div className={styles.page}>
  <section className={styles.planClientPicker} aria-label="Choose client plan"><div><p className={styles.eyebrow}>CLIENT PLANS & CREDITS</p><h2>Choose a client</h2><p>Review requests, manage the monthly plan and record paid credit additions.</p></div><label>Client plan<select value={selected} disabled={!clients} onChange={event=>router.push(clientPath+'?client='+encodeURIComponent(event.target.value))}>{!clients&&<option value="">Loading clients…</option>}{clients?.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></section>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {client?<div><div className={styles.selectedPlanClient}><span>SELECTED CLIENT</span><h2>{client.name}</h2><p>Payments are confirmed outside the portal. Reviewing a request does not charge the client or add credits.</p></div><AdminClientPlan key={selected} clientId={String(selected)} clientName={client.name}/></div>:clients?<p>No selected client. Create or choose a client to set up a plan.</p>:<p role="status">Loading clients…</p>}
 </div>;
}
