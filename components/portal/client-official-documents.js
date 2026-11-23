"use client";
import {useEffect,useId,useRef,useState} from "react";
import Link from "next/link";
import s from "./client-official-documents.module.css";
import {documentOpenLabel} from "@/lib/document-open-label";

export default function ClientOfficialDocuments({clientId,summary=false,initialResult}) {
 const scopedInitial=initialResult?.clientId===String(clientId)?initialResult:null;
 const initialData=Array.isArray(scopedInitial?.data?.items)?scopedInitial.data:null;
 const initialError=typeof scopedInitial?.error==="string"?scopedInitial.error:"";
 const skipInitialLoad=useRef(Boolean(initialData||initialError));
 const [data,setData]=useState(initialData),[error,setError]=useState(initialError),[reload,setReload]=useState(0);
 const [search,setSearch]=useState(""),[query,setQuery]=useState({search:"",page:0});const inputId=useId();
 useEffect(()=>{
  let request=0,active=null,activeTimer=null,disposed=false;
  async function load(){
   if(disposed||(active&&!active.signal.aborted))return;
   const sequence=++request;active?.abort();window.clearTimeout(activeTimer);
   const controller=new AbortController();active=controller;setError("");
   // Bound the full response, including its body. Do not leave the library in
   // loading if a network request or response stream never settles.
   const deadline=window.setTimeout(()=>{
    controller.abort();
    if(!disposed&&sequence===request){++request;setData(null);setError("Loading documents is taking longer than expected. Please try again.");}
   },20000);activeTimer=deadline;
   try{
    const params=new URLSearchParams({clientId,page:String(query.page),search:query.search});
    const response=await fetch("/api/client-documents?"+params,{signal:controller.signal,cache:"no-store",headers:{"x-aoc-document-client":clientId}});
    let result;try{result=await response.json();}catch{throw Error("Documents could not be loaded. Please try again.");}
    if(!response.ok)throw Error(typeof result?.error==="string"?result.error:"Documents could not be loaded. Please try again.");
    if(!result||!Array.isArray(result.items))throw Error("Documents could not be loaded. Please try again.");
    if(!disposed&&!controller.signal.aborted&&sequence===request)setData(result);
   }catch(failure){if(!disposed&&!controller.signal.aborted&&sequence===request){setData(null);setError(failure.message);}}
   finally{window.clearTimeout(deadline);if(active===controller)active=null;}
  }
  // Screenshot tools can temporarily hide the page. Keep the current list and
  // any in-flight read; returning revalidates silently instead of blanking it.
  // Failed authorization still clears the list through the normal error path.
  const visible=()=>{if(document.visibilityState==="visible")load();};
  // Defer consuming the initial result until the active effect runs, so Strict
  // Mode's setup/cleanup replay cannot trigger a duplicate initial fetch.
  Promise.resolve().then(()=>{if(disposed)return;if(skipInitialLoad.current){skipInitialLoad.current=false;return;}return load();});
  document.addEventListener("visibilitychange",visible);
  return()=>{disposed=true;++request;active?.abort();window.clearTimeout(activeTimer);document.removeEventListener("visibilitychange",visible);};
 },[clientId,reload,query]);
 const items=data?.items||[];
 return <section className={`${s.panel}${summary?" "+s.summary:""}`} aria-label="Client document library">
  <header><div><small>YOUR CLIENT WORKSPACE</small><h2>Document Library</h2><p>Your shared documents, reports and reference materials.</p></div>{summary&&<Link href="/?view=documents" prefetch={false}>View all documents</Link>}</header>
  {!summary&&<form className={s.filters} aria-label="Find documents" onSubmit={event=>{event.preventDefault();setData(null);setQuery({search:search.trim(),page:0});}}>
   <div className={s.search}><label htmlFor={inputId}>Search document titles</label><input id={inputId} type="search" value={search} onChange={event=>setSearch(event.target.value)} maxLength={180} placeholder="For example: website audit report"/></div>
   <div className={s.filterActions}><button type="submit" className={s.primary}>Search documents</button>{(search||query.search)&&<button type="button" onClick={()=>{setSearch("");setData(null);setQuery({search:"",page:0});}}>Clear search</button>}</div>
  </form>}
  {error?<div role="alert"><p>{error}</p><button type="button" onClick={()=>setReload(v=>v+1)}>Try again</button></div>:!data?<p role="status">Loading your documents...</p>:<section id="approved-engagement-documents" aria-label="Shared documents">
   <div className={s.documentHeading}><h3>Shared documents</h3>{!summary&&items.length>0&&<small>Page {query.page+1}</small>}</div>
   {items.length?<ul className={s.files}>{items.slice(0,summary?3:50).map(item=><li key={item.id}><div className={s.fileDetails}><strong>{item.title}</strong>{item.description&&<p className={s.description}>{item.description}</p>}<small>Shared {new Date(item.publishedAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"})}</small></div><div className={s.actions}>{item.canView&&<a href={item.viewUrl} target="_blank" rel="noreferrer">{item.viewLabel||documentOpenLabel({delivery:item.delivery,mimeType:item.mimeType,filename:item.title})}</a>}{item.downloadUrl&&<a href={item.downloadUrl}>Download</a>}</div></li>)}</ul>:query.search?<div className={s.empty} role="status"><strong>No matching documents</strong><p>Try another document title.</p></div>:<p>No documents have been shared yet. Your team will add approved files here.</p>}
   {!summary&&(query.page>0||data.hasMore)&&<nav className={s.actions} aria-label="Document pages"><button type="button" disabled={query.page===0} onClick={()=>{setData(null);setQuery(old=>({...old,page:old.page-1}));}}>Previous documents</button><span>Page {query.page+1}</span><button type="button" disabled={!data.hasMore} onClick={()=>{setData(null);setQuery(old=>({...old,page:old.page+1}));}}>Next documents</button></nav>}
   {items.some(item=>item.delivery==="link")&&<p className={s.note}>Google Drive controls file access and downloads. If prompted, sign in with the Google account the file was shared with. Use its download option if the owner allows it.</p>}
  </section>}
 </section>;
}
