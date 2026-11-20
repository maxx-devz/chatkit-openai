"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {DOCUMENT_CATEGORIES} from "@/lib/client-document-categories";
import s from "./client-official-documents.module.css";
export default function ClientOfficialDocuments({clientId,summary=false}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[page,setPage]=useState(0);
 useEffect(()=>{const c=new AbortController();let request=0;
 async function load(){const seq=++request;setData(null);setError('');try{const r=await fetch('/api/client-documents?clientId='+clientId+'&page='+page,{signal:c.signal,cache:'no-store',headers:{'x-aoc-document-client':clientId}});const d=await r.json();if(!r.ok)throw Error(d.error||'Documents could not be loaded.');if(!c.signal.aborted&&seq===request)setData(d);}catch(e){if(!c.signal.aborted&&seq===request)setError(e.message);}}
 const visible=()=>{if(document.visibilityState==='visible')load();else{++request;setData(null);}};
 Promise.resolve().then(load);window.addEventListener('focus',load);document.addEventListener('visibilitychange',visible);
 return()=>{c.abort();window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',visible);};},[clientId,reload,page]);
 const journey=data?.journey;
 return <section className={s.panel} aria-label="Official client documents and journey"><header><div><small>YOUR CLIENT WORKSPACE</small><h2>Documents & journey</h2><p>Your approved engagement documents and verified next step.</p></div>{summary&&<Link href="/?view=documents">View all documents</Link>}</header>
 {error?<div role="alert"><p>{error}</p><button type="button" onClick={()=>setReload(v=>v+1)}>Try again</button></div>:!data?<p role="status">Loading your documents…</p>:<>
 <section className={s.journey}><h3>Your journey</h3>{journey?<><p><strong>{journey.completed?'Journey complete':`Stage ${journey.currentStage}: ${journey.stageLabels[journey.currentStage-1]}`}</strong></p>{!summary&&<ol className={s.stages}>{journey.stageLabels.map((name,i)=>{const state=journey.completed||i+1<journey.currentStage?'Completed':i+1===journey.currentStage?'Current':'Upcoming';return <li key={i} className={state==='Current'?s.current:undefined}><span>{i+1}</span><div><strong>{name}</strong><small>{state}</small></div></li>;})}</ol>}<p>{journey.evidenceSummary}</p><small>Updated {new Date(journey.updatedAt).toLocaleDateString()}</small><div className={s.next}><strong>Next required action</strong><p>{journey.nextAction||'Your team has not recorded a further client action.'}</p></div></>:<p>Your team has not recorded verified journey progress yet. Contact your AOC team for your next step.</p>}</section>
 <section><h3>Approved documents</h3>{data.items.length?<ul className={s.files}>{data.items.slice(0,summary?3:100).map(item=><li key={item.id}><div><strong>{item.title}</strong><small>{DOCUMENT_CATEGORIES[item.category]} · Stage {item.stage}{journey?' — '+journey.stageLabels[item.stage-1]:''} · Version {item.version}</small><small>Approved {new Date(item.publishedAt).toLocaleDateString()}</small></div><div className={s.actions}>{item.canView&&<a href={item.viewUrl} target="_blank" rel="noreferrer">View</a>}<a href={item.downloadUrl}>Download</a></div></li>)}</ul>:<p>No approved documents are available yet. Your team will add client-facing files here when they are ready.</p>}
 {!summary&&(page>0||data.hasMore)&&<nav className={s.actions} aria-label="Document pages"><button type="button" disabled={page===0} onClick={()=>setPage(v=>v-1)}>Previous documents</button><span>Page {page+1}</span><button type="button" disabled={!data.hasMore} onClick={()=>setPage(v=>v+1)}>Next documents</button></nav>}
 {!summary&&<p className={s.note}>Document emails continue as usual. Files open only while your account and the approved version remain authorized. A document appearing here does not confirm payment or change your journey.</p>}</section></>}
 </section>;
}
