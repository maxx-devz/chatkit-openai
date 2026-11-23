"use client";
import ActionCue from "@/components/portal-ui/action-cue";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useAdminDraft} from "./admin-draft-provider";
import DocumentDeliveryManager from "./document-delivery-manager";
import DocumentLinkPublication from "./document-link-publication";
import s from "./client-document-assignments.module.css";
async function api(client,body,signal){
 const response=await fetch("/api/admin/client-document-assignments"+(body?"":client?"?clientId="+encodeURIComponent(client):""),{cache:"no-store",signal,headers:{...(client?{"x-aoc-document-client":client}:{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{method:"POST",body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok){const error=Error(data.error||"Document setup could not be loaded.");error.status=response.status;throw error;}return data;
}
const empty={title:"",url:"",description:""};
function AssignmentForm({client,item,onSaved,onCancel}){
 const baseline=item?{title:item.title,url:item.url,description:item.description||""}:empty;
 const draft=useAdminDraft(`document-reference:${client.id}:${item?.id||"new"}:${item?.revision||"new"}`,baseline);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const pending=useRef(null);
 const change=event=>{const {name,value}=event.target;draft.update(old=>({...old,[name]:value}));setError("");};
 async function save(event){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  const command={action:"save",clientId:client.id,...(item?{id:item.id,revision:item.revision}:{}),...draft.value,reason:item?"Updated document details":"Added document link"};
  const serialized=JSON.stringify(command);if(pending.current?.serialized!==serialized)pending.current={serialized,operation:crypto.randomUUID()};
  try{await api(client.id,{...command,operation:pending.current.operation});draft.clear();pending.current=null;await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section data-action-card={item?"edit":"add"} className={s.card} aria-labelledby="reference-form-title"><ActionCue tone={item?"edit":"add"}>{item?"Edit reference":"Add reference"}</ActionCue><h2 id="reference-form-title">{item?"Edit document":"Add document"}</h2>
  <p className={s.muted}>Use an existing Google Drive file link. After saving, publish it from Saved references. Google controls file access and downloads. A tab or heading link still opens the whole file.</p>
  <form onSubmit={save}><fieldset disabled={busy} className={s.fields}>
   <label htmlFor="document-reference-title">Document title</label><input id="document-reference-title" name="title" value={draft.value.title} onChange={change} maxLength={180} required placeholder="For example: approved audit report"/>
   <label htmlFor="document-reference-url">Google Drive file link</label><input id="document-reference-url" name="url" type="url" value={draft.value.url} onChange={change} maxLength={500} required placeholder="Paste the existing Google link" aria-describedby="reference-link-help"/>
   <small id="reference-link-help">Save the link first, then choose Publish link in Saved references. Google sharing controls who can open or download it.</small>
   <label htmlFor="document-reference-description">Description</label><textarea id="document-reference-description" name="description" value={draft.value.description} onChange={change} maxLength={1000} rows={3} placeholder="Briefly explain what this document contains and how the client can use it."/>
   <small>Optional. Visible to this client after publication. Keep internal notes and sensitive details out.</small>{item&&<small>Saving changes makes this link private until you publish it again.</small>}
   {error&&<p role="alert" className={s.error}>{error}</p>}
   <div className={s.actions}><button data-action={item?"edit":"add"} type="submit" className={s.primary}>{busy?"Saving…":item?"Save changes":"Save document"}</button>{item&&<button type="button" onClick={onCancel}>Cancel edit</button>}</div>
  </fieldset></form>
 </section>;
}
function ReferenceItem({item,client,onEdit,onRemoved,onPublished}){
 const [removing,setRemoving]=useState(false),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");const operation=useRef(null);
 async function remove(event){event.preventDefault();setBusy(true);setError("");const command={action:"archive",clientId:item.clientId,id:item.id,revision:item.revision,reason};const key=JSON.stringify(command);if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};try{await api(item.clientId,{...command,operation:operation.current.id});await onRemoved();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <li className={s.reference}><div><div className={s.itemHeading}><strong>{item.title}</strong><span className={item.status==="published_link"?s.published:s.saved}>{item.status==="published_link"?"Published to "+client.name:"Private draft"}</span></div>
  {item.description&&<p className={s.description}>{item.description}</p>}<p>{item.kind==="folder"?"Private folder reference":"Google Drive document"}</p>
  <p className={s.url}>{item.url}</p><small>Last saved {new Date(item.updatedAt).toLocaleString()}</small></div>
  <div className={s.actions}><a href={item.url} target="_blank" rel="noreferrer">Open in Drive</a><button data-action="edit" type="button" disabled={busy} onClick={()=>onEdit(item)}>Edit</button><button data-action="danger" type="button" disabled={busy} onClick={()=>setRemoving(!removing)}>Remove</button></div>
  {removing&&<form data-action-card="danger" onSubmit={remove} className={s.remove}><ActionCue tone="danger">Danger · Remove this reference</ActionCue><p>Remove this saved reference? The original Drive file will stay unchanged.</p><label htmlFor={"remove-reason-"+item.id}>Reason for removal</label><input id={"remove-reason-"+item.id} value={reason} onChange={e=>setReason(e.target.value)} maxLength={400} required disabled={busy}/><div className={s.actions}><button data-action="danger" type="submit" disabled={busy||!reason.trim()}>Confirm removal</button><button data-action="neutral" type="button" onClick={()=>setRemoving(false)} disabled={busy}>Keep reference</button></div></form>}
  {error&&<p role="alert" className={s.error}>{error}</p>}
 <DocumentLinkPublication key={item.revision} item={item} client={client} onSaved={onPublished}/>
 </li>;
}
function SelectedClient({id}){
 const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[editing,setEditing]=useState(null),[notice,setNotice]=useState("");
 const request=useRef(0);
 const load=useCallback(async signal=>{const current=++request.current;setLoading(true);setError("");try{const result=await api(id,null,signal);if(!signal?.aborted&&current===request.current)setData(result);}catch(e){if(!signal?.aborted&&current===request.current){if([401,403,404].includes(e.status))setData(null);setError(e.message);}}finally{if(!signal?.aborted&&current===request.current)setLoading(false);}},[id]);
 // Native selects and returning to this tab can emit window focus. Reload only
 // on client selection, an explicit refresh, or a completed change.
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>load(controller.signal));return()=>controller.abort();},[load]);
 const saved=async()=>{setEditing(null);setNotice("Reference saved. It is not published or visible to the client.");await load();};
 const published=async text=>{setEditing(null);setNotice(text);await load();};
 const removed=async()=>{setEditing(null);setNotice("Reference removed. The original Drive item was not changed.");await load();};
 if(loading&&!data)return <p role="status">Loading saved references…</p>;
 if(error&&!data)return <section className={s.card}><p role="alert" className={s.error}>{error}</p><button type="button" onClick={()=>load()}>Try again</button></section>;
 if(!data?.setupReady)return <section className={s.card}><h2>Document setup is not ready yet</h2><p>The portal owner needs to complete document-reference storage setup. Existing documents remain available through the current library.</p></section>;
 return <><section className={s.clientBar}><div><span>Selected client</span><h2>{data.client.name}</h2></div><span className={s.saved}>Client link library</span></section>
 {notice&&<p role="status" className={s.success}>{notice}</p>}
 {error&&<p role="alert" className={s.error}>{error} Displayed references may be out of date. Refresh to try again; your unsaved edits are kept.</p>}
 <div className={s.grid}><AssignmentForm key={editing?.id||"new"} client={data.client} item={editing} onSaved={saved} onCancel={()=>setEditing(null)}/>
 <section className={s.card} aria-labelledby="saved-references-title" aria-busy={loading}><div className={s.itemHeading}><h2 id="saved-references-title">Saved references</h2><button type="button" disabled={loading} onClick={()=>load()}>{loading?"Refreshing references…":"Refresh references"}</button></div><p className={s.muted}>Saved links stay private until you publish them. Clients open published files in Google Drive.</p>{data.assignments.length?<ul className={s.references}>{data.assignments.map(item=><ReferenceItem key={item.id+":"+item.revision} item={item} client={data.client} onEdit={setEditing} onRemoved={removed} onPublished={published}/>)}</ul>:<div className={s.empty}><strong>No reference assigned yet</strong><p>Save an existing Drive link using the form. Nothing will be uploaded or published.</p></div>}</section></div>
 <DocumentDeliveryManager clientId={id} references={data.assignments}/>
 {!!data.history.length&&<details className={s.card}><summary>Recent admin changes</summary><ul className={s.history}>{data.history.map((entry,i)=><li key={i}><strong>{{create:"Reference added",update:"Reference updated",archive:"Reference removed",publish:"Link published",revoke:"Link unpublished"}[entry.action]||"Reference changed"}</strong><p>{entry.reason}</p><small>{entry.actorName||"Authorized administrator"} · {new Date(entry.occurredAt).toLocaleString()}</small></li>)}</ul></details>}
 </>;
}
export default function ClientDocumentAssignments(){
 const [clients,setClients]=useState(null),[error,setError]=useState(""),[selected,setSelected]=useState(""),[query,setQuery]=useState("");
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>api("",null,controller.signal)).then(data=>{if(!controller.signal.aborted)setClients(data.clients);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
 return <div className={s.manager}><section className={s.intro}><span className={s.step}>CLIENT DOCUMENT LIBRARY</span><h2>Choose the client. Add and publish a link.</h2><p>Keep approved documents in Google Drive. Set up their client assignment here without uploading another copy.</p></section>
 {error?<p role="alert" className={s.error}>{error}</p>:!clients?<p role="status">Loading clients…</p>:!clients.length?<section className={s.card}><h2>No clients available</h2><Link href="/admin?view=clients">Create a client first</Link></section>:<section className={s.picker}><div><label htmlFor="reference-client-search">Find a client</label><input id="reference-client-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by client name"/></div><div><label htmlFor="reference-client-select">Client account</label><select id="reference-client-select" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a client</option>{clients.filter(c=>c.id===selected||c.name.toLowerCase().includes(query.toLowerCase())||c.slug.toLowerCase().includes(query.toLowerCase())).map(c=><option key={c.id} value={c.id}>{c.name}{c.enabled?"":" (portal paused)"}</option>)}</select></div></section>}
 {selected?<SelectedClient key={selected} id={selected}/>:clients?.length?<section className={s.empty}><h2>Start by choosing a client</h2><p>Their saved links will appear here. Publish only the individual files approved for this client.</p></section>:null}
 </div>;
}
