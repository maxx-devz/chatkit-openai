"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useAdminDraft} from "./admin-draft-provider";
import {JOURNEY_STAGE_LABELS} from "@/lib/client-document-assignment-policy";
import s from "./client-document-assignments.module.css";
async function api(client,body,signal){
 const response=await fetch("/api/admin/client-document-assignments"+(body?"":client?"?clientId="+encodeURIComponent(client):""),{cache:"no-store",signal,headers:{...(client?{"x-aoc-document-client":client}:{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{method:"POST",body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error||"Document setup could not be loaded.");return data;
}
const empty={title:"",url:"",stage:"",reason:""};
function AssignmentForm({client,item,onSaved,onCancel}){
 const baseline=item?{title:item.title,url:item.url,stage:item.stage==null?"":String(item.stage),reason:""}:empty;
 const draft=useAdminDraft(`document-reference:${client.id}:${item?.id||"new"}:${item?.revision||"new"}`,baseline);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const pending=useRef(null);
 const change=event=>{const {name,value}=event.target;draft.update(old=>({...old,[name]:value}));setError("");};
 async function save(event){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  const command={action:"save",clientId:client.id,...(item?{id:item.id,revision:item.revision}:{}),...draft.value,stage:draft.value.stage===""?null:Number(draft.value.stage)};
  const serialized=JSON.stringify(command);if(pending.current?.serialized!==serialized)pending.current={serialized,operation:crypto.randomUUID()};
  try{await api(client.id,{...command,operation:pending.current.operation});draft.clear();pending.current=null;await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className={s.card} aria-labelledby="reference-form-title"><h2 id="reference-form-title">{item?"Edit saved reference":"Add a Drive reference"}</h2>
  <p className={s.muted}>Use the original file or approved client-facing folder. No second upload is needed.</p>
  <form onSubmit={save}><fieldset disabled={busy} className={s.fields}>
   <label htmlFor="document-reference-title">Display name</label><input id="document-reference-title" name="title" value={draft.value.title} onChange={change} maxLength={180} required placeholder="For example: approved audit report"/>
   <label htmlFor="document-reference-url">Google Drive file or folder link</label><input id="document-reference-url" name="url" type="url" value={draft.value.url} onChange={change} maxLength={500} required placeholder="Paste the existing Google link" aria-describedby="reference-link-help"/>
   <small id="reference-link-help">Google access is not verified by saving this link. No files become visible to the client yet.</small>
   <label htmlFor="document-reference-stage">Related journey stage (optional)</label><select id="document-reference-stage" name="stage" value={draft.value.stage} onChange={change}><option value="">Not assigned</option>{JOURNEY_STAGE_LABELS.map((name,i)=><option key={name} value={String(i+1)}>{i+1}. {name}</option>)}</select>
   <small>A document stage label does not change journey progress.</small>
   <label htmlFor="document-reference-reason">Reason for this change</label><input id="document-reference-reason" name="reason" value={draft.value.reason} onChange={change} maxLength={400} required placeholder="A short note for the admin history"/>
   {error&&<p role="alert" className={s.error}>{error}</p>}
   <div className={s.actions}><button type="submit" className={s.primary}>{busy?"Saving…":item?"Save changes":"Save reference"}</button>{item&&<button type="button" onClick={onCancel}>Cancel edit</button>}</div>
  </fieldset></form>
 </section>;
}
function ReferenceItem({item,onEdit,onRemoved}){
 const [removing,setRemoving]=useState(false),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");const operation=useRef(null);
 async function remove(event){event.preventDefault();setBusy(true);setError("");const command={action:"archive",clientId:item.clientId,id:item.id,revision:item.revision,reason};const key=JSON.stringify(command);if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};try{await api(item.clientId,{...command,operation:operation.current.id});await onRemoved();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <li className={s.reference}><div><div className={s.itemHeading}><strong>{item.title}</strong><span className={s.saved}>Saved · Not published</span></div>
  <p>{item.kind==="folder"?"Drive folder":"Drive document"}{item.stage?` · Stage ${item.stage}: ${JOURNEY_STAGE_LABELS[item.stage-1]}`:" · No journey stage assigned"}</p>
  <p className={s.url}>{item.url}</p><small>Last saved {new Date(item.updatedAt).toLocaleString()}</small></div>
  <div className={s.actions}><a href={item.url} target="_blank" rel="noreferrer">Open in Drive</a><button type="button" disabled={busy} onClick={()=>onEdit(item)}>Edit</button><button type="button" disabled={busy} onClick={()=>setRemoving(!removing)}>Remove</button></div>
  {removing&&<form onSubmit={remove} className={s.remove}><p>Remove this saved reference? The original Drive file will stay unchanged.</p><label htmlFor={"remove-reason-"+item.id}>Reason for removal</label><input id={"remove-reason-"+item.id} value={reason} onChange={e=>setReason(e.target.value)} maxLength={400} required disabled={busy}/><div className={s.actions}><button type="submit" disabled={busy||!reason.trim()}>Confirm removal</button><button type="button" onClick={()=>setRemoving(false)} disabled={busy}>Keep reference</button></div></form>}
  {error&&<p role="alert" className={s.error}>{error}</p>}
 </li>;
}
function SelectedClient({id}){
 const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[editing,setEditing]=useState(null),[notice,setNotice]=useState("");
 const load=useCallback(async signal=>{setLoading(true);try{const result=await api(id,null,signal);if(!signal?.aborted){setData(result);setError("");}}catch(e){if(!signal?.aborted){setData(null);setError(e.message);}}finally{if(!signal?.aborted)setLoading(false);}},[id]);
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>load(controller.signal));const focus=()=>load(controller.signal);window.addEventListener("focus",focus);return()=>{controller.abort();window.removeEventListener("focus",focus);};},[load]);
 const saved=async()=>{setEditing(null);setNotice("Reference saved. It is not published or visible to the client.");await load();};
 const removed=async()=>{setEditing(null);setNotice("Reference removed. The original Drive item was not changed.");await load();};
 if(loading)return <p role="status">Loading saved references…</p>;
 if(error)return <section className={s.card}><p role="alert" className={s.error}>{error}</p><button type="button" onClick={()=>load()}>Try again</button></section>;
 if(!data?.setupReady)return <section className={s.card}><h2>Document setup is not ready yet</h2><p>The portal owner needs to complete document-reference storage setup. Existing documents remain available through the current library.</p></section>;
 return <><section className={s.clientBar}><div><span>Selected client</span><h2>{data.client.name}</h2></div><span className={s.saved}>Admin setup only</span></section>
 {notice&&<p role="status" className={s.success}>{notice}</p>}
 <div className={s.grid}><AssignmentForm key={editing?.id||"new"} client={data.client} item={editing} onSaved={saved} onCancel={()=>setEditing(null)}/>
 <section className={s.card} aria-labelledby="saved-references-title"><h2 id="saved-references-title">Saved references</h2><p className={s.muted}>These are setup records, not approved client releases.</p>{data.assignments.length?<ul className={s.references}>{data.assignments.map(item=><ReferenceItem key={item.id+":"+item.revision} item={item} onEdit={setEditing} onRemoved={removed}/>)}</ul>:<div className={s.empty}><strong>No reference assigned yet</strong><p>Save an existing Drive link using the form. Nothing will be uploaded or published.</p></div>}</section></div>
 <section className={s.next}><h2>What happens next?</h2><p>Google access and the exact released version will be verified before client publication and automated retrieval are enabled. Saving a link does not confirm payment, advance the journey or add the file to AI knowledge.</p></section>
 {!!data.history.length&&<details className={s.card}><summary>Recent admin changes</summary><ul className={s.history}>{data.history.map((entry,i)=><li key={i}><strong>{entry.action==="create"?"Reference added":entry.action==="update"?"Reference updated":"Reference removed"}</strong><p>{entry.reason}</p><small>{entry.actorName||"Authorized administrator"} · {new Date(entry.occurredAt).toLocaleString()}</small></li>)}</ul></details>}
 </>;
}
export default function ClientDocumentAssignments(){
 const [clients,setClients]=useState(null),[error,setError]=useState(""),[selected,setSelected]=useState(""),[query,setQuery]=useState("");
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>api("",null,controller.signal)).then(data=>{if(!controller.signal.aborted)setClients(data.clients);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
 return <div className={s.manager}><section className={s.intro}><span className={s.step}>STEP 1 · CLIENT DOCUMENT SETUP</span><h2>Choose the client. Save the original link.</h2><p>Keep approved documents in Google Drive. Set up their client assignment here without uploading another copy.</p></section>
 {error?<p role="alert" className={s.error}>{error}</p>:!clients?<p role="status">Loading clients…</p>:!clients.length?<section className={s.card}><h2>No clients available</h2><Link href="/admin?view=clients">Create a client first</Link></section>:<section className={s.picker}><div><label htmlFor="reference-client-search">Find a client</label><input id="reference-client-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by client name"/></div><div><label htmlFor="reference-client-select">Client account</label><select id="reference-client-select" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a client</option>{clients.filter(c=>c.id===selected||c.name.toLowerCase().includes(query.toLowerCase())||c.slug.toLowerCase().includes(query.toLowerCase())).map(c=><option key={c.id} value={c.id}>{c.name}{c.enabled?"":" (portal paused)"}</option>)}</select></div></section>}
 {selected?<SelectedClient key={selected} id={selected}/>:clients?.length?<section className={s.empty}><h2>Start by choosing a client</h2><p>Their saved references will appear here. Client documents remain private until the release checks are connected.</p></section>:null}
 </div>;
}
