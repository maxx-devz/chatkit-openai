"use client";
import {useRef,useState} from "react";
import ActionCue from "@/components/portal-ui/action-cue";
import s from "./client-document-assignments.module.css";

export default function DocumentLinkPublication({item,client,onSaved,children,destructiveAction,disabled=false}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const pending=useRef(null),published=item.status==="published_link";
 async function submit(event){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  const form=new FormData(event.currentTarget);
  const command={action:published?"revoke":"publish",clientId:client.id,id:item.id,revision:item.revision,reason:published?'Unpublished document link':'Published approved document link',
   ...(!published?{confirmed:form.get("confirmed")==="on"}:{})};
  const raw=JSON.stringify(command);if(pending.current?.raw!==raw)pending.current={raw,operation:crypto.randomUUID()};
  try{
   const response=await fetch('/api/admin/client-document-assignments',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','x-aoc-document-client':client.id},body:JSON.stringify({...command,operation:pending.current.operation})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'The document link could not be updated.');
   await onSaved(published?'Link unpublished. New portal opens are blocked; Google sharing permissions stay unchanged.':'Link published to '+client.name+'. They can now open it from Documents. Google controls file access and downloads.');
   setOpen(false);pending.current=null;
  }catch(failure){setError(failure.message);}finally{setBusy(false);}
 }
 return <div className={s.publication}>
 <div className={s.referenceActions}>
 {children}
 {item.kind==="document"&&<button type="button" data-action={published?"danger":"add"} aria-expanded={open} aria-controls={"publish-reference-"+item.id} onClick={()=>{setOpen(!open);setError("");}} disabled={busy||disabled}>{published?'Unpublish link':'Publish link'}</button>}
 {destructiveAction}
 </div>
 {item.kind!=="document"&&<p className={s.muted}>Folder references stay private. Add individual approved file links to publish them to this client.</p>}
 {open&&<form id={"publish-reference-"+item.id} data-action-card={published?"danger":"warning"} onSubmit={submit} className={s.remove}><ActionCue tone={published?"danger":"warning"}>{published?'Withdraw portal access':'Approve a client-facing link'}</ActionCue>
 <h3>{published?'Unpublish this link':'Publish this link to '+client.name}</h3>
 <p>{published?'This removes the link from the client portal. Copies of the Google URL and existing Google permissions cannot be recalled here.':'Review the entire original file and its Google sharing settings. Publishing lists the link for this client; it does not change Google permissions or freeze the file contents.'}</p>
 <fieldset className={s.fields} disabled={busy}>
 {!published&&<> <label className={s.checkbox}><input name="confirmed" type="checkbox" required/>I reviewed the whole file, confirmed it is appropriate for {client.name}, and checked that Google sharing allows the intended recipient. It contains no internal drafts or restricted information.</label></>}
 
 {error&&<p role="alert" className={s.error}>{error}</p>}
 <div className={s.actions}><button type="submit" data-action={published?'danger':'add'} className={s.primary}>{busy?'Saving...':published?'Confirm unpublish':'Confirm publication'}</button><button type="button" onClick={()=>setOpen(false)}>Cancel</button></div>
 </fieldset></form>}</div>;
}
