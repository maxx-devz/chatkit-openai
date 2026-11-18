"use client";
import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import styles from './portal-usage.module.css';
import {usd} from '@/lib/ai-spending-format';
const number=value=>new Intl.NumberFormat().format(Number(value) || 0);
export default function ClearAiUsageHistory({clients=[]}) {
  const params=useSearchParams();
  const [selection,setSelection]=useState(()=>params.get('usageClient')?'client:'+params.get('usageClient'):'');
  const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7)),[all,setAll]=useState(true);
  const [preview,setPreview]=useState(null),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const invalidate=()=>{setPreview(null);setConfirmation('');setError('');setMessage('');};
  async function request(body) {
    const response=await fetch('/api/admin/ai-usage/history',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const value=await response.json();if(!response.ok)throw Error(value.error || 'AI usage could not be reset.');return value;
  }
  async function prepare() {
    if(busy || !selection)return;setBusy('preview');setError('');setMessage('');setPreview(null);setConfirmation('');
    try{setPreview(await request({action:'preview',scope:selection.startsWith('client:')?'client':selection,
      clientId:selection.startsWith('client:')?selection.slice(7):null,period:all?'all':month}));}
    catch(failure){setError(failure.message);}finally{setBusy('');}
  }
  async function clear() {
    if(busy || !preview || confirmation!=='RESET')return;setBusy('clear');setError('');setMessage('');
    try{const result=await request({action:'clear',token:preview.token,confirmation});
      setMessage(result.clientsReset>0?'AI usage and consumed credits reset for '+number(result.clientsReset)+' client workspace(s). Assigned credits are kept. New AI usage counts from the reset cutoff.'
        :result.cleared || result.costsCleared?'Selected AI activity reset.':'This reset was already processed. Newer usage was kept.');
      setPreview(null);setConfirmation('');window.dispatchEvent(new Event('aoc:ai-usage-changed'));
      if(result.scope!=='admin' && typeof BroadcastChannel!=='undefined') {
        const channel=new BroadcastChannel('aoc-credits-updated');
        channel.postMessage({clientId:result.clientId,all:result.scope==='clients',reset:true});channel.close();
      }
    }catch(failure){setError(failure.message);}finally{setBusy('');}
  }
  return <section className={styles.historyControls} id="clear-ai-usage" aria-labelledby="clear-ai-usage-title">
    <h3 id="clear-ai-usage-title">Reset AI usage &amp; credits</h3>
    <p>Start AI usage reporting fresh: reset token history, API dollar costs, AOC usage fees and consumed credits for the selected client and period. Assigned credits and pricing stay saved. For example, 600 assigned credits with all usage reset shows 600 available, before new usage.</p>
    <p>Conversations, Hubstaff hours and budgets, Google connections and API keys stay unchanged. This resets portal reporting; it does not refund provider charges. Earlier records remain archived for audit.</p>
    <div className={styles.historyFields}>
      <label>AI usage for<select value={selection} disabled={Boolean(busy)} onChange={event=>{setSelection(event.target.value);invalidate();}}>
        <option value="">Choose a scope</option><option value="clients">All client AI usage</option>
        {clients.map(client=><option key={client.id} value={'client:'+client.id}>{client.name}</option>)}
        <option value="admin">AOC Admin AI chat</option>
      </select></label>
      <label>UTC month<input type="month" value={month} max={new Date().toISOString().slice(0,7)} disabled={Boolean(busy) || all} onChange={event=>{setMonth(event.target.value);invalidate();}}/></label>
      <label className={styles.historyAll}><input type="checkbox" checked={all} disabled={Boolean(busy)} onChange={event=>{setAll(event.target.checked);invalidate();}}/>All recorded history</label>
    </div>
    <button type="button" disabled={Boolean(busy) || !selection || (!all && !month)} onClick={()=>void prepare()}>{busy==='preview'?'Preparing preview...':'Preview AI usage reset'}</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {preview && <div className={styles.historyPreview}>
      <h4>{preview.label} / {preview.period==='all'?'All recorded history':preview.period+' UTC'}</h4>
      <p><strong>{number(preview.requests)} AI chat activity records</strong> / known input tokens: {number(preview.inputTokens)} / known output tokens: {number(preview.outputTokens)}.</p>
      <p><strong>{usd(preview.knownUsd)} known API usage</strong> across {number(preview.costEvents)} cost records.</p>
      {(preview.unpriced>0 || preview.missingCosts>0) && <p>Some earlier costs are incomplete. Reset archives that earlier usage instead of estimating its cost.</p>}
      {preview.clients>0 && <p><strong>{number(preview.clients)} client workspace(s):</strong> consumed credits and usage fees before the cutoff will stop counting. Allowance additions and adjustments stay available, including their transaction history.</p>}
      {preview.scope==='admin' && <p>Private admin chat has no client credits allowance to reset.</p>}
      <p>Cutoff: {new Date(preview.before).toLocaleString()}. New requests after this cutoff continue counting. The preview expires after 10 minutes.</p>
      {preview.clients>0 || preview.requests>0 || preview.costEvents>0?<><label>Type RESET to confirm<input value={confirmation} autoComplete="off" disabled={Boolean(busy)} onChange={event=>setConfirmation(event.target.value)}/></label>
        <button type="button" className={styles.clearHistoryButton} disabled={Boolean(busy) || confirmation!=='RESET'} onClick={()=>void clear()}>{busy==='clear'?'Resetting...':'Reset selected AI usage and consumed credits'}</button></>:<p>No matching AI usage records or clients.</p>}
    </div>}
  </section>;
}
