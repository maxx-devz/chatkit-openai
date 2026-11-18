"use client";
import Link from "next/link";
import {useEffect,useId,useRef,useState} from "react";
import styles from "./portal-page-search.module.css";

export default function PortalPageSearch({items}) {
  const [query,setQuery]=useState(""),[open,setOpen]=useState(false);
  const root=useRef(null),input=useRef(null),id=useId();
  useEffect(()=>{const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[]);
  const matches=items.filter(item=>item.label.toLowerCase().includes(query.trim().toLowerCase()));
  function keyDown(event) {
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);input.current?.focus();}
    if(event.key==="ArrowDown" || event.key==="ArrowUp") {
      event.preventDefault();setOpen(true);
      requestAnimationFrame(()=>{const links=[...root.current.querySelectorAll("nav a")];
        const index=links.indexOf(document.activeElement),next=event.key==="ArrowDown"?(index+1)%links.length:(index<=0?links.length-1:index-1);
        links[next]?.focus();});
    }
  }
  return <div ref={root} className={styles.search} onKeyDown={keyDown}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <label><span className="sr-only">Find a portal page</span><span aria-hidden="true">⌕</span>
      <input ref={input} type="search" placeholder="Find a portal page…" value={query} aria-controls={id}
        onFocus={event=>{if(!root.current?.contains(event.relatedTarget))setOpen(true);}} onChange={event=>{setQuery(event.target.value);setOpen(true);}}/></label>
    {open && <nav id={id} aria-label="Matching portal pages" className={styles.results}>
      <small>Page navigation · not a task or conversation search</small>
      {matches.length?matches.map(item=><Link key={item.href} href={item.href} prefetch={false} onClick={()=>{setOpen(false);setQuery("");}}>{item.label}</Link>)
        :<p role="status">No matching page in your available navigation.</p>}
    </nav>}
  </div>;
}
