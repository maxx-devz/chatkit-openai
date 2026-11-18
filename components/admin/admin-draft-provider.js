"use client";
import {createContext,useContext,useEffect,useState} from "react";
const Context=createContext(null);
export default function AdminDraftProvider({children}) {
  const [drafts,setDrafts]=useState({});
  const dirty=Object.keys(drafts).length>0;
  useEffect(()=>{
    if(!dirty)return;
    const unload=event=>{event.preventDefault();event.returnValue="";};
    const leave=event=>{
      const link=event.target.closest?.('a[href]');
      if(!link || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target==="_blank")return;
      const url=new URL(link.href,window.location.href);
      if(url.origin===window.location.origin && (url.pathname==="/admin" || url.pathname.startsWith("/admin/")))return;
      if(!window.confirm("Leave the admin workspace and discard unsaved edits?")){event.preventDefault();event.stopPropagation();}
    };
    window.addEventListener("beforeunload",unload);document.addEventListener("click",leave,true);
    return()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",leave,true);};
  },[dirty]);
  return <Context.Provider value={{drafts,setDrafts,dirty}}>{children}</Context.Provider>;
}
export function useAdminDraft(key,baseline) {
  const context=useContext(Context);
  const [local,setLocal]=useState({});
  const drafts=context?.drafts || local,setDrafts=context?.setDrafts || setLocal;
  const value=drafts[key] || baseline;
  const update=next=>setDrafts(previous=>{const nextValue=typeof next==="function"?next(previous[key] || baseline):next;
    const result={...previous};if(JSON.stringify(nextValue)===JSON.stringify(baseline))delete result[key];else result[key]=nextValue;return result;});
  const clear=()=>setDrafts(previous=>{const result={...previous};delete result[key];return result;});
  const clearIfUnchanged=expected=>setDrafts(previous=>{if(JSON.stringify(previous[key] || baseline)!==JSON.stringify(expected))return previous;
    const result={...previous};delete result[key];return result;});
  return {value,update,clear,clearIfUnchanged,dirty:Object.hasOwn(drafts,key)};
}
export function useAdminDirty() {return useContext(Context)?.dirty || false;}
